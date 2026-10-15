use std::fs;
use std::path::{Path, PathBuf};

use rusqlite::{params, Connection, OptionalExtension, Row};
use uuid::Uuid;

use super::types::{ArtifactMeta, ARTIFACT_KINDS, ARTIFACT_SOURCES};
use super::validate::one_of;
use crate::session_store::validate_id;

const MAX_BODY: usize = 2_000_000;
const SELECT: &str =
    "SELECT id, card_id, kind, version, source, stage_run_id, created_at FROM task_board_artifacts";

fn sql_error(error: rusqlite::Error) -> String {
    error.to_string()
}

fn from_row(row: &Row<'_>) -> rusqlite::Result<ArtifactMeta> {
    Ok(ArtifactMeta {
        id: row.get(0)?,
        card_id: row.get(1)?,
        kind: row.get(2)?,
        version: row.get(3)?,
        source: row.get(4)?,
        stage_run_id: row.get(5)?,
        created_at: row.get(6)?,
    })
}

/// Paths are derived from validated ids and a fixed kind list, never from input.
pub(crate) fn card_dir(base: &Path, card_id: &str) -> Result<PathBuf, String> {
    validate_id(card_id, "card")?;
    Ok(base.join(card_id))
}

fn file_path(base: &Path, card_id: &str, kind: &str, version: i64) -> Result<PathBuf, String> {
    one_of(kind, &ARTIFACT_KINDS, "artifact kind")?;
    Ok(card_dir(base, card_id)?.join(format!("{kind}-{version}.md")))
}

fn write_atomic(path: &Path, body: &str) -> Result<(), String> {
    let parent = path
        .parent()
        .ok_or_else(|| "Invalid artifact path.".to_string())?;
    fs::create_dir_all(parent).map_err(|error| error.to_string())?;
    let temp = parent.join(format!(".{}.tmp", Uuid::new_v4()));
    fs::write(&temp, body).map_err(|error| error.to_string())?;
    fs::rename(&temp, path).map_err(|error| {
        let _ = fs::remove_file(&temp);
        error.to_string()
    })
}

pub(crate) struct ArtifactWrite<'a> {
    pub card_id: &'a str,
    pub kind: &'a str,
    pub source: &'a str,
    pub stage_run_id: Option<&'a str>,
    pub body: &'a str,
}

pub(crate) fn write(
    conn: &mut Connection,
    base: &Path,
    input: &ArtifactWrite<'_>,
    now: i64,
) -> Result<ArtifactMeta, String> {
    validate_id(input.card_id, "card")?;
    one_of(input.kind, &ARTIFACT_KINDS, "artifact kind")?;
    one_of(input.source, &ARTIFACT_SOURCES, "artifact source")?;
    if let Some(run) = input.stage_run_id {
        validate_id(run, "stage run")?;
    }
    if input.body.trim().is_empty() || input.body.len() > MAX_BODY {
        return Err("Artifact body is empty or too large.".into());
    }

    let tx = conn.transaction().map_err(sql_error)?;
    let exists: bool = tx
        .query_row(
            "SELECT EXISTS(SELECT 1 FROM task_board_cards WHERE id = ?1)",
            [input.card_id],
            |row| row.get(0),
        )
        .map_err(sql_error)?;
    if !exists {
        return Err("Card not found.".into());
    }
    let version: i64 = tx
        .query_row(
            "SELECT COALESCE(MAX(version), 0) + 1 FROM task_board_artifacts
             WHERE card_id = ?1 AND kind = ?2",
            params![input.card_id, input.kind],
            |row| row.get(0),
        )
        .map_err(sql_error)?;

    let path = file_path(base, input.card_id, input.kind, version)?;
    write_atomic(&path, input.body)?;
    let meta = ArtifactMeta {
        id: Uuid::new_v4().to_string(),
        card_id: input.card_id.into(),
        kind: input.kind.into(),
        version,
        source: input.source.into(),
        stage_run_id: input.stage_run_id.map(str::to_string),
        created_at: now,
    };
    let saved = tx
        .execute(
            "INSERT INTO task_board_artifacts (id, card_id, kind, version, source, stage_run_id, created_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
            params![
                meta.id,
                meta.card_id,
                meta.kind,
                meta.version,
                meta.source,
                meta.stage_run_id,
                meta.created_at
            ],
        )
        .and_then(|_| tx.commit());
    if let Err(error) = saved {
        let _ = fs::remove_file(&path);
        return Err(sql_error(error));
    }
    Ok(meta)
}

pub(crate) fn list(conn: &Connection, card_id: &str) -> Result<Vec<ArtifactMeta>, String> {
    validate_id(card_id, "card")?;
    let mut statement = conn
        .prepare(&format!(
            "{SELECT} WHERE card_id = ?1 ORDER BY kind, version"
        ))
        .map_err(sql_error)?;
    let rows = statement
        .query_map([card_id], from_row)
        .map_err(sql_error)?;
    rows.collect::<rusqlite::Result<Vec<_>>>()
        .map_err(sql_error)
}

pub(crate) fn read(
    conn: &Connection,
    base: &Path,
    card_id: &str,
    kind: &str,
    version: i64,
) -> Result<String, String> {
    validate_id(card_id, "card")?;
    one_of(kind, &ARTIFACT_KINDS, "artifact kind")?;
    let known = conn
        .query_row(
            "SELECT 1 FROM task_board_artifacts WHERE card_id = ?1 AND kind = ?2 AND version = ?3",
            params![card_id, kind, version],
            |_| Ok(()),
        )
        .optional()
        .map_err(sql_error)?;
    if known.is_none() {
        return Err("Artifact not found.".into());
    }
    fs::read_to_string(file_path(base, card_id, kind, version)?)
        .map_err(|error| format!("Artifact file is unreadable: {error}"))
}

pub(crate) fn remove_card_dir(base: &Path, card_id: &str) -> Result<(), String> {
    let dir = card_dir(base, card_id)?;
    match fs::remove_dir_all(&dir) {
        Ok(()) => Ok(()),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(()),
        Err(error) => Err(error.to_string()),
    }
}
