use std::{
    fs::{self, OpenOptions},
    io::{ErrorKind, Write},
    path::Path,
};
use uuid::Uuid;

fn directory(path: &Path) -> Result<(), String> {
    match fs::create_dir(path) {
        Ok(()) => {}
        Err(error) if error.kind() == ErrorKind::AlreadyExists => {}
        Err(error) => return Err(format!("{}: {error}", path.display())),
    }

    let metadata = fs::symlink_metadata(path).map_err(|error| error.to_string())?;
    if !metadata.is_dir() || metadata.file_type().is_symlink() {
        return Err(format!(
            "Unsafe Task Board artifact directory: {}",
            path.display()
        ));
    }
    Ok(())
}

fn matches(path: &Path, body: &str) -> Result<(), String> {
    let metadata = fs::symlink_metadata(path).map_err(|error| error.to_string())?;
    if !metadata.is_file() || metadata.file_type().is_symlink() {
        return Err("Unsafe Task Board artifact file.".into());
    }
    if metadata.len() != body.len() as u64
        || fs::read(path).map_err(|error| error.to_string())? != body.as_bytes()
    {
        return Err(
            "Existing task artifact differs from the saved card; it was not overwritten.".into(),
        );
    }
    Ok(())
}

fn sync_directories(base: &Path, parent: &Path) -> Result<(), String> {
    #[cfg(unix)]
    for path in [
        parent,
        base,
        base.parent()
            .filter(|path| !path.as_os_str().is_empty())
            .unwrap_or_else(|| Path::new(".")),
    ] {
        fs::File::open(path)
            .and_then(|directory| directory.sync_all())
            .map_err(|error| {
                format!("Cannot sync artifact directory {}: {error}", path.display())
            })?;
    }
    #[cfg(not(unix))]
    let _ = (base, parent);

    Ok(())
}

pub(super) fn publish(base: &Path, card_id: &str, body: &str) -> Result<(), String> {
    publish_version(
        base,
        card_id,
        super::super::constants::TASK,
        super::super::constants::INITIAL_VERSION,
        body,
    )
}

pub(crate) fn publish_version(
    base: &Path,
    card_id: &str,
    kind: &str,
    version: i64,
    body: &str,
) -> Result<(), String> {
    super::validation::id(card_id)?;
    if !crate::task_board::stage::contracts::constants::SAVED_KINDS.contains(&kind) || version < 1 {
        return Err("Invalid Board artifact path.".into());
    }
    directory(base)?;
    let parent = base.join(card_id);
    directory(&parent)?;
    let path = parent.join(format!("{kind}-{version}.md"));
    match fs::symlink_metadata(&path) {
        Ok(_) => {
            matches(&path, body)?;
            return sync_directories(base, &parent);
        }
        Err(error) if error.kind() == ErrorKind::NotFound => {}
        Err(error) => return Err(error.to_string()),
    }

    let temp = parent.join(format!(".{}.tmp", Uuid::new_v4()));
    let mut options = OpenOptions::new();
    options.write(true).create_new(true);
    #[cfg(unix)]
    {
        use std::os::unix::fs::OpenOptionsExt;
        options.mode(0o600);
    }
    let mut file = options.open(&temp).map_err(|error| error.to_string())?;
    let result = file
        .write_all(body.as_bytes())
        .and_then(|_| file.sync_all());
    drop(file);
    let result = result.map_err(|error| error.to_string()).and_then(|_| {
        // A task version is immutable; publishing must never replace another writer's file.
        match fs::hard_link(&temp, &path) {
            Ok(()) => Ok(()),
            Err(error) if error.kind() == ErrorKind::AlreadyExists => matches(&path, body),
            Err(error) => Err(error.to_string()),
        }
    });
    if let Err(error) = fs::remove_file(&temp) {
        return Err(format!(
            "Task artifact temporary-file cleanup failed: {error}; save result: {result:?}"
        ));
    }
    result?;
    sync_directories(base, &parent)
}
