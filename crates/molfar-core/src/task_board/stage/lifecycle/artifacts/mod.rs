use super::constants::{ARTIFACT_KINDS, MAX_ARTIFACT};
use crate::task_board::{
    create::{artifact_file, validation},
    stage::contracts::types::ParsedArtifact,
};
use rusqlite::{params, Connection, OptionalExtension};
use std::{fs, path::Path};
use uuid::Uuid;

pub(crate) fn read(base: &Path, card: &str, kind: &str, version: i64) -> Result<String, String> {
    validation::id(card)?;
    if !["task", "spec", "plan", "questions"].contains(&kind) || version < 1 {
        return Err("Invalid Board artifact path.".into());
    }
    for path in [
        base.to_path_buf(),
        base.join(card),
        base.join(card).join(format!("{kind}-{version}.md")),
    ] {
        let metadata = fs::symlink_metadata(&path)
            .map_err(|e| format!("Cannot read Board artifact {}: {e}", path.display()))?;
        if metadata.file_type().is_symlink() {
            return Err("Unsafe Board artifact path.".into());
        }
    }
    fs::read_to_string(base.join(card).join(format!("{kind}-{version}.md")))
        .map_err(|e| format!("Cannot read Board artifact: {e}"))
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
                        && fs::read(&path).map_err(|e| e.to_string())? == artifact.body.as_bytes()
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
        conn.execute("INSERT INTO task_board_artifacts(id,card_id,kind,version,source,stage_run_id,created_at) VALUES(?1,?2,?3,?4,'stage',?5,?6)",params![Uuid::new_v4().to_string(),card,artifact.kind,version,run,now]).map_err(|e|e.to_string())?;
    }
    Ok(())
}
