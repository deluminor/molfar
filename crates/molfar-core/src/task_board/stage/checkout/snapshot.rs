use super::types::CheckoutSnapshot;
use crate::git::{git, git_bytes};
use sha2::{Digest, Sha256};
use std::{ffi::OsString, path::Path};

#[cfg(unix)]
fn file_name(bytes: &[u8]) -> Result<OsString, String> {
    use std::os::unix::ffi::OsStringExt;
    Ok(OsString::from_vec(bytes.to_vec()))
}

#[cfg(all(test, unix))]
#[test]
fn unix_path_conversion_preserves_non_utf8_bytes() {
    use std::os::unix::ffi::OsStrExt;
    let bytes = [b'n', 0xff];
    assert_eq!(file_name(&bytes).unwrap().as_bytes(), bytes);
}

#[cfg(not(unix))]
fn file_name(bytes: &[u8]) -> Result<OsString, String> {
    String::from_utf8(bytes.to_vec())
        .map(OsString::from)
        .map_err(|error| format!("Cannot preserve Git path bytes: {error}"))
}

fn untracked_bytes(path: &Path) -> Result<(&'static [u8], Vec<u8>), String> {
    let error = |error: std::io::Error| format!("Cannot fingerprint untracked file: {error}");
    let kind = std::fs::symlink_metadata(path).map_err(error)?.file_type();
    if kind.is_symlink() {
        let target = std::fs::read_link(path).map_err(error)?;
        return Ok((b"symlink", target.into_os_string().into_encoded_bytes()));
    }
    if !kind.is_file() {
        return Err(format!(
            "Cannot fingerprint untracked {}: not a regular file",
            path.display()
        ));
    }

    Ok((b"untracked", std::fs::read(path).map_err(error)?))
}

pub(super) fn capture(root: &Path) -> Result<CheckoutSnapshot, String> {
    let head = git(root, &["rev-parse", "HEAD"])?.trim().into();
    let porcelain = git(root, &["status", "--porcelain=v1", "--untracked-files=all"])?;
    let diff = git_bytes(root, &["diff", "HEAD", "--binary", "--no-ext-diff"])?;
    let index = git_bytes(
        root,
        &["diff", "--cached", "HEAD", "--binary", "--no-ext-diff"],
    )?;
    let untracked = git_bytes(root, &["ls-files", "-o", "--exclude-standard", "-z"])?;
    let mut hasher = Sha256::new();
    for (label, bytes) in [
        (b"worktree".as_slice(), diff.as_slice()),
        (b"index".as_slice(), index.as_slice()),
    ] {
        hasher.update(label);
        hasher.update((bytes.len() as u64).to_be_bytes());
        hasher.update(bytes);
    }
    for name in untracked
        .split(|byte| *byte == 0)
        .filter(|name| !name.is_empty())
    {
        let (label, bytes) = untracked_bytes(&root.join(file_name(name)?))?;
        hasher.update(label);
        hasher.update((name.len() as u64).to_be_bytes());
        hasher.update(name);
        hasher.update((bytes.len() as u64).to_be_bytes());
        hasher.update(bytes);
    }
    Ok(CheckoutSnapshot {
        head,
        porcelain,
        fingerprint: format!("{:x}", hasher.finalize()),
    })
}
