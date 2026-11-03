use std::path::Path;
use std::sync::Mutex;

use super::STATE_NAMES;

fn private_entry(name: &str) -> bool {
    STATE_NAMES.contains(&name)
        || name.contains(".sqlite")
        || name.ends_with(".db")
        || name.ends_with(".db-wal")
        || name.ends_with(".db-shm")
        || name.ends_with(".lock")
        || name.starts_with(".molfar-")
        || name == "session_index.jsonl.lock"
}

// ponytail: one process-wide lock rather than one per home; preparation is a
// few filesystem calls, so contention is negligible. Add a per-home map if
// that ever changes. Only serializes this process, not other Codex CLIs.
static PREPARE_LOCK: Mutex<()> = Mutex::new(());

pub(super) fn prepare_files(source: &Path, home: &Path) -> Result<(), String> {
    // link_entry and the lock cleanup below are check-then-act sequences, so
    // concurrent preparations of the same home would otherwise race.
    let _serialized = PREPARE_LOCK.lock().unwrap_or_else(|e| e.into_inner());
    std::fs::create_dir_all(source)
        .map_err(|e| format!("Could not open the Codex account directory: {e}"))?;
    std::fs::create_dir_all(home)
        .map_err(|e| format!("Could not create Familiar Codex storage: {e}"))?;
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        std::fs::set_permissions(home, std::fs::Permissions::from_mode(0o700))
            .map_err(|e| e.to_string())?;
    }
    let source = source.canonicalize().map_err(|e| e.to_string())?;
    let canonical_home = home.canonicalize().map_err(|e| e.to_string())?;
    if canonical_home.starts_with(&source) || source.starts_with(&canonical_home) {
        return Err("Familiar Codex storage must be separate from the normal Codex home".into());
    }
    for name in STATE_NAMES {
        if std::fs::symlink_metadata(home.join(name)).is_ok_and(|m| m.file_type().is_symlink()) {
            return Err("Familiar Codex state must remain in its private storage directory".into());
        }
    }
    // Familiars provisioned before session_index.jsonl.lock became private may
    // still have it symlinked (or, on Windows, hard-linked) to the account
    // home from an earlier sync; drop the link so a fresh private lock
    // takes its place.
    let familiar_lock = home.join("session_index.jsonl.lock");
    if std::fs::symlink_metadata(&familiar_lock).is_ok_and(|m| m.file_type().is_symlink()) {
        match std::fs::remove_file(&familiar_lock) {
            Ok(()) => {}
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => {}
            Err(e) => return Err(e.to_string()),
        }
    }
    #[cfg(windows)]
    remove_if_same_file(&familiar_lock, &source.join("session_index.jsonl.lock"))?;
    for entry in std::fs::read_dir(&source).map_err(|e| e.to_string())? {
        let entry = entry.map_err(|e| e.to_string())?;
        let name = entry.file_name();
        if private_entry(&name.to_string_lossy()) {
            continue;
        }
        link_entry(&entry.path(), &home.join(name))?;
    }
    // Keep the auth link valid even if login creates/replaces the original later.
    #[cfg(unix)]
    for name in ["auth.json", ".credentials.json"] {
        link_entry(&source.join(name), &home.join(name))?;
    }
    #[cfg(windows)]
    if !source.join("auth.json").exists() && home.join("auth.json").exists() {
        std::fs::remove_file(home.join("auth.json")).map_err(|e| e.to_string())?;
    }
    // Encrypted auth/MCP files are replaced atomically. Sharing their directory,
    // rather than individual files, preserves those writes in both homes.
    std::fs::create_dir_all(source.join("secrets")).map_err(|e| e.to_string())?;
    link_entry(&source.join("secrets"), &home.join("secrets"))?;
    std::fs::create_dir_all(home.join("sessions")).map_err(|e| e.to_string())?;
    Ok(())
}

/// Removes `path` only if it identifies the same on-disk file as
/// `reference` (matching volume serial and file index) — the Windows
/// counterpart of the Unix symlink cleanup, for a stale hard link.
/// `std::os::windows::fs::MetadataExt` exposes the same identity fields but
/// is still gated behind the unstable `windows_by_handle` feature, so this
/// goes through the raw API directly.
///
/// Deletes through the same handle the identity check was made on, rather
/// than re-resolving `path` for the delete: `prepare_files` has no lock
/// serializing concurrent preparations of the same home, so whatever sits
/// at `path` by the time of a separate path-based delete could already be a
/// different file — e.g. a fresh private lock the real Codex CLI just wrote.
/// Fails closed throughout: any open/query failure is treated as "nothing
/// to remove", never as a reason to fall back to deleting by path.
#[cfg(windows)]
fn remove_if_same_file(path: &Path, reference: &Path) -> Result<(), String> {
    use std::os::windows::fs::OpenOptionsExt;
    use std::os::windows::io::AsRawHandle;
    use windows_sys::Win32::Storage::FileSystem::{
        FileDispositionInfo, GetFileInformationByHandle, SetFileInformationByHandle,
        BY_HANDLE_FILE_INFORMATION, DELETE, FILE_DISPOSITION_INFO, FILE_READ_ATTRIBUTES,
        FILE_SHARE_DELETE, FILE_SHARE_READ, FILE_SHARE_WRITE,
    };

    fn identity(file: &std::fs::File) -> Option<(u32, u64)> {
        let mut info: BY_HANDLE_FILE_INFORMATION = unsafe { std::mem::zeroed() };
        let ok = unsafe { GetFileInformationByHandle(file.as_raw_handle() as _, &mut info) };
        if ok == 0 {
            return None;
        }
        let index = ((info.nFileIndexHigh as u64) << 32) | info.nFileIndexLow as u64;
        Some((info.dwVolumeSerialNumber, index))
    }

    // FileDispositionInfo requires DELETE access on the handle; plain read
    // access (GENERIC_READ via `.read(true)`) does not include it.
    fn open_shared(path: &Path) -> std::io::Result<std::fs::File> {
        std::fs::OpenOptions::new()
            .access_mode(FILE_READ_ATTRIBUTES | DELETE)
            .share_mode(FILE_SHARE_READ | FILE_SHARE_WRITE | FILE_SHARE_DELETE)
            .open(path)
    }

    let Ok(target) = open_shared(path) else {
        return Ok(());
    };
    let Ok(reference) = open_shared(reference) else {
        return Ok(());
    };
    let (Some(target_id), Some(reference_id)) = (identity(&target), identity(&reference)) else {
        return Ok(());
    };
    if target_id != reference_id {
        return Ok(());
    }

    let disposition = FILE_DISPOSITION_INFO { DeleteFile: true };
    let ok = unsafe {
        SetFileInformationByHandle(
            target.as_raw_handle() as _,
            FileDispositionInfo,
            &disposition as *const FILE_DISPOSITION_INFO as *const core::ffi::c_void,
            std::mem::size_of::<FILE_DISPOSITION_INFO>() as u32,
        )
    };
    if ok == 0 {
        return Err(std::io::Error::last_os_error().to_string());
    }
    Ok(())
}

pub(super) fn link_entry(source: &Path, target: &Path) -> Result<(), String> {
    if let Ok(link) = std::fs::read_link(target) {
        if link == source {
            return Ok(());
        }
        // Windows junctions can return a different path spelling than the
        // canonical source (for example, without the verbatim path prefix).
        #[cfg(windows)]
        if link.canonicalize().is_ok_and(|resolved| resolved == source) {
            return Ok(());
        }
        return Err(format!(
            "Unexpected link in Familiar Codex storage: {}",
            target.display()
        ));
    }
    if target.exists() {
        #[cfg(windows)]
        if target.is_file() && source.is_file() {
            std::fs::remove_file(target).map_err(|e| e.to_string())?;
        } else {
            return Err(format!(
                "Unexpected entry in Familiar Codex storage: {}",
                target.display()
            ));
        }
        #[cfg(not(windows))]
        return Err(format!(
            "Unexpected entry in Familiar Codex storage: {}",
            target.display()
        ));
    }
    #[cfg(unix)]
    if let Err(error) = std::os::unix::fs::symlink(source, target) {
        if std::fs::read_link(target).ok().as_deref() != Some(source) {
            return Err(format!("Could not share Codex configuration: {error}"));
        }
    }
    #[cfg(windows)]
    {
        if source.is_dir() {
            // Junctions work without Administrator privileges or Developer Mode.
            // Windows PowerShell adds an NT prefix to an already verbatim
            // canonical path, producing a junction with an unreadable target.
            junction::create(source, target)
                .map_err(|e| format!("Could not share the Codex configuration directory: {e}"))?;
        } else if source.is_file() {
            std::fs::hard_link(source, target)
                .map_err(|e| format!("Could not share Codex configuration: {e}"))?;
        }
    }
    Ok(())
}
