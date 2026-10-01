use super::constants::MAX_DOCUMENT_BYTES;
use super::paths;
use super::types::VaultDocument;
use sha2::{Digest, Sha256};
use std::fs::{File, OpenOptions};
use std::io::{Read, Write};
use std::path::Path;

pub fn revision(body: &[u8]) -> String {
    format!("{:x}", Sha256::digest(body))
}

pub fn read(root: &Path, path: &str) -> Result<VaultDocument, String> {
    let destination = paths::resolve(root, path)?;
    if !paths::is_markdown(&destination) {
        return Err("Only Markdown notes can be opened in the editor.".into());
    }
    let mut options = OpenOptions::new();
    options.read(true);
    #[cfg(unix)]
    {
        use std::os::unix::fs::OpenOptionsExt;
        options.custom_flags(libc::O_NOFOLLOW | libc::O_NONBLOCK);
    }
    let file = options
        .open(&destination)
        .map_err(|error| format!("{path}: {error}"))?;
    let metadata = file.metadata().map_err(|error| error.to_string())?;
    if !metadata.is_file() {
        return Err("Note path must be a regular file.".into());
    }
    if metadata.len() > MAX_DOCUMENT_BYTES {
        return Err("Note exceeds the 2 MiB limit.".into());
    }
    let mut bytes = Vec::new();
    file.take(MAX_DOCUMENT_BYTES + 1)
        .read_to_end(&mut bytes)
        .map_err(|error| format!("{path}: {error}"))?;
    if bytes.len() as u64 > MAX_DOCUMENT_BYTES {
        return Err("Note exceeds the 2 MiB limit.".into());
    }
    let revision = revision(&bytes);
    let body = String::from_utf8(bytes).map_err(|_| format!("{path}: note is not UTF-8."))?;

    Ok(VaultDocument {
        path: path.into(),
        body,
        revision,
    })
}

pub fn atomic_write(
    destination: &Path,
    body: &[u8],
    validate: impl FnOnce() -> Result<(), String>,
) -> Result<(), String> {
    let parent = destination
        .parent()
        .ok_or("File has no parent directory.")?;
    let temporary = parent.join(format!(".monocode-{}.tmp", uuid::Uuid::new_v4()));
    let result = (|| {
        let mut file = OpenOptions::new()
            .create_new(true)
            .write(true)
            .open(&temporary)
            .map_err(|error| format!("Cannot create save file: {error}"))?;
        file.write_all(body).map_err(|error| error.to_string())?;
        file.sync_all().map_err(|error| error.to_string())?;
        if destination.exists() {
            let metadata = std::fs::metadata(destination).map_err(|error| error.to_string())?;
            std::fs::set_permissions(&temporary, metadata.permissions())
                .map_err(|error| error.to_string())?;
        }
        drop(file);
        validate()?;
        std::fs::rename(&temporary, destination)
            .map_err(|error| format!("Cannot replace note: {error}"))?;
        #[cfg(unix)]
        File::open(parent)
            .and_then(|directory| directory.sync_all())
            .map_err(|error| format!("Save completed, directory sync failed: {error}"))?;

        Ok(())
    })();
    if result.is_err() && temporary.exists() {
        if let Err(error) = std::fs::remove_file(&temporary) {
            eprintln!("knowledge save cleanup {}: {error}", temporary.display());
        }
    }

    result
}

pub fn save(root: &Path, path: &str, body: &str, expected: &str) -> Result<VaultDocument, String> {
    if body.len() as u64 > MAX_DOCUMENT_BYTES {
        return Err("Note exceeds the 2 MiB limit.".into());
    }
    let current = read(root, path)?;
    if current.revision != expected {
        return Err("CONFLICT: Note changed on disk. Reload before saving.".into());
    }
    let destination = paths::resolve(root, path)?;
    atomic_write(&destination, body.as_bytes(), || {
        if paths::resolve(root, path)? != destination || read(root, path)?.revision != expected {
            return Err("CONFLICT: Note changed during saving. Reload before saving.".into());
        }
        Ok(())
    })?;

    Ok(VaultDocument {
        path: path.into(),
        body: body.into(),
        revision: revision(body.as_bytes()),
    })
}
