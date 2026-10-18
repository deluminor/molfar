use std::fs;
use std::path::{Path, PathBuf};

use rusqlite::{Connection, OptionalExtension};
use serde::Deserialize;

use super::artifacts;
use crate::session_store::validate_id;

/// Engine-owned handoff folder inside a card's worktree, relative to its root.
pub(crate) const BOARD_DIR: &str = ".molfar/board";
/// Hides the folder from status, `ls-files --others` and `git add -A`.
const IGNORE_ALL: &str = "*\n";

#[derive(Clone, Debug, Deserialize)]
pub struct InputRef {
    pub kind: String,
    pub version: i64,
}

pub(crate) struct Prepared {
    root: PathBuf,
    files: Vec<(String, String)>,
}

fn worktree_of(conn: &Connection, card_id: &str) -> Result<PathBuf, String> {
    validate_id(card_id, "card")?;
    let path: Option<Option<String>> = conn
        .query_row(
            "SELECT worktree_path FROM task_board_cards WHERE id = ?1",
            [card_id],
            |row| row.get(0),
        )
        .optional()
        .map_err(|error| error.to_string())?;
    let path = path
        .ok_or_else(|| "Card not found.".to_string())?
        .ok_or_else(|| "Card has no worktree.".to_string())?;
    let root = PathBuf::from(path);
    if !root.is_absolute() || !root.is_dir() {
        return Err("Card worktree is missing.".into());
    }
    Ok(root)
}

/// Reads the requested versions under the store lock; writing happens after it drops.
pub(crate) fn prepare(
    conn: &Connection,
    base: &Path,
    card_id: &str,
    inputs: &[InputRef],
) -> Result<Prepared, String> {
    let root = worktree_of(conn, card_id)?;
    let files = inputs
        .iter()
        .map(|input| {
            let body = artifacts::read(conn, base, card_id, &input.kind, input.version)?;
            Ok((format!("{}-v{}.md", input.kind, input.version), body))
        })
        .collect::<Result<Vec<_>, String>>()?;
    Ok(Prepared { root, files })
}

/// A worktree is agent-writable, so a symlinked folder could redirect the copy elsewhere.
fn real_dir_or_absent(path: &Path) -> Result<bool, String> {
    match fs::symlink_metadata(path) {
        Ok(meta) if meta.file_type().is_dir() => Ok(true),
        Ok(_) => Err(format!("{} is not a plain folder.", path.display())),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(false),
        Err(error) => Err(error.to_string()),
    }
}

/// Replaces the handoff folder with exactly these files; returns their worktree-relative paths.
pub(crate) fn write(prepared: &Prepared) -> Result<Vec<String>, String> {
    let parent = prepared.root.join(".molfar");
    let dir = parent.join("board");
    real_dir_or_absent(&parent)?;
    if real_dir_or_absent(&dir)? {
        fs::remove_dir_all(&dir).map_err(|error| error.to_string())?;
    }
    fs::create_dir_all(&dir).map_err(|error| error.to_string())?;
    fs::write(dir.join(".gitignore"), IGNORE_ALL).map_err(|error| error.to_string())?;

    prepared
        .files
        .iter()
        .map(|(name, body)| {
            fs::write(dir.join(name), body).map_err(|error| error.to_string())?;
            Ok(format!("{BOARD_DIR}/{name}"))
        })
        .collect()
}
