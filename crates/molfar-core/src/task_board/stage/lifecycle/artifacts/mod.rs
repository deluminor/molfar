use super::constants::{ARTIFACT_KINDS, MAX_ARTIFACT};
use crate::task_board::{
    create::{artifact_file, validation},
    stage::contracts::types::ParsedArtifact,
};
use rusqlite::{params, Connection, OptionalExtension};
use std::{fs, io::Read, path::Path};
use uuid::Uuid;

pub(crate) fn read(base: &Path, card: &str, kind: &str, version: i64) -> Result<String, String> {
    validation::id(card)?;
    if !crate::task_board::stage::contracts::constants::SAVED_KINDS.contains(&kind) || version < 1 {
        return Err("Invalid Board artifact path.".into());
    }
    let parent = base.join(card);
    for directory in [base, parent.as_path()] {
        let metadata = fs::symlink_metadata(directory)
            .map_err(|e| format!("Cannot read Board artifact directory: {e}"))?;
        if metadata.file_type().is_symlink() || !metadata.is_dir() {
            return Err("Unsafe Board artifact directory.".into());
        }
    }
    let path = parent.join(format!("{kind}-{version}.md"));
    let metadata =
        fs::symlink_metadata(&path).map_err(|e| format!("Cannot read Board artifact: {e}"))?;
    if metadata.file_type().is_symlink() || !metadata.is_file() {
        return Err("Unsafe Board artifact file.".into());
    }
    if metadata.len() > MAX_ARTIFACT as u64 {
        return Err("Board artifact exceeds the size limit.".into());
    }
    let mut options = fs::OpenOptions::new();
    options.read(true);
    #[cfg(unix)]
    {
        use std::os::unix::fs::OpenOptionsExt;
        options.custom_flags(libc::O_NOFOLLOW | libc::O_NONBLOCK);
    }
    let file = options
        .open(path)
        .map_err(|e| format!("Cannot read Board artifact: {e}"))?;
    if !file.metadata().map_err(|e| e.to_string())?.is_file() {
        return Err("Unsafe Board artifact file.".into());
    }
    let mut body = String::new();
    file.take(MAX_ARTIFACT as u64 + 1)
        .read_to_string(&mut body)
        .map_err(|e| format!("Cannot read Board artifact: {e}"))?;
    if body.len() > MAX_ARTIFACT {
        return Err("Board artifact exceeds the size limit.".into());
    }
    if body.trim().is_empty() {
        return Err("Board artifact is empty.".into());
    }
    Ok(body)
}

pub(crate) fn write(
    conn: &Connection,
    base: &Path,
    card: &str,
    run: &str,
    artifacts: &[ParsedArtifact],
    now: i64,
) -> Result<(), String> {
    validation::id(card)?;
    let mut seen = std::collections::HashSet::new();
    for artifact in artifacts {
        if !ARTIFACT_KINDS.contains(&artifact.kind.as_str())
            || !seen.insert(&artifact.kind)
            || artifact.body.trim().is_empty()
            || artifact.body.len() > MAX_ARTIFACT
        {
            return Err("Invalid or duplicate Grill output artifact.".into());
        }
    }
    if !["spec", "plan"]
        .iter()
        .all(|kind| artifacts.iter().any(|a| a.kind == *kind))
    {
        return Err("Grill requires complete spec and plan artifacts.".into());
    }
    for artifact in artifacts {
        let saved:Option<i64>=conn.query_row("SELECT version FROM task_board_artifacts WHERE card_id=?1 AND kind=?2 AND stage_run_id=?3",params![card,artifact.kind,run],|r|r.get(0)).optional().map_err(|e|e.to_string())?;
        if let Some(version) = saved {
            if read(base, card, &artifact.kind, version)? != artifact.body {
                return Err("Saved stage artifact differs from its immutable receipt.".into());
            }
            continue;
        }
        publish(
            conn,
            base,
            card,
            artifact,
            super::constants::STAGE_SOURCE,
            Some(run),
            now,
        )?;
    }
    Ok(())
}

pub(crate) fn publish(
    conn: &Connection,
    base: &Path,
    card: &str,
    artifact: &ParsedArtifact,
    source: &str,
    run: Option<&str>,
    now: i64,
) -> Result<(), String> {
    validation::id(card)?;
    let mut version:i64=conn.query_row("SELECT COALESCE(MAX(version),0)+1 FROM task_board_artifacts WHERE card_id=?1 AND kind=?2",params![card,artifact.kind],|r|r.get(0)).map_err(|e|e.to_string())?;
    let start = version;
    loop {
        let path = base
            .join(card)
            .join(format!("{}-{version}.md", artifact.kind));
        match fs::symlink_metadata(&path) {
            Ok(metadata) => {
                if metadata.file_type().is_symlink() || !metadata.is_file() {
                    return Err("Unsafe stage artifact file.".into());
                }
                if metadata.len() == artifact.body.len() as u64
                    && read(base, card, &artifact.kind, version)? == artifact.body
                {
                    break;
                }
                version = version.checked_add(1).ok_or("Artifact version overflow")?;
                if version - start > 10_000 {
                    return Err("Too many conflicting stage artifact files.".into());
                }
            }
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => break,
            Err(e) => return Err(e.to_string()),
        }
    }
    artifact_file::publish_version(base, card, &artifact.kind, version, &artifact.body)?;
    conn.execute("INSERT INTO task_board_artifacts(id,card_id,kind,version,source,stage_run_id,created_at) VALUES(?1,?2,?3,?4,?5,?6,?7)",params![Uuid::new_v4().to_string(),card,artifact.kind,version,source,run,now]).map_err(|e|e.to_string())?;
    Ok(())
}
