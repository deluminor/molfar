use super::{documents, toggle_task, ConnectionState, VaultDocument, VaultHost};
use serde_json::{json, Value};
use std::path::Path;

pub const VAULT_NOT_FOUND: &str = "Vault not found.";
pub const NOTE_NOT_FOUND: &str = "Knowledge note not found.";

pub enum NoteEdit {
    Replace { body: String, resumed: bool },
    Toggle { ordinal: usize },
}

impl VaultHost {
    pub fn external_read(&self, connection_id: &str, path: &str) -> Result<VaultDocument, String> {
        let inner = self.lock()?;
        let root = authorized_root(&inner.state, connection_id)?;
        external_read(root, path)
    }

    pub fn external_edit(
        &self,
        connection_id: &str,
        path: &str,
        expected: &str,
        edit: NoteEdit,
    ) -> Result<Value, String> {
        let mut inner = self.lock()?;
        let root = authorized_root(&inner.state, connection_id)?;
        let note = external_read(root, path)?;
        if matches!(&edit, NoteEdit::Replace { body, resumed: true } if note.body == *body) {
            return Ok(json!({"path":path,"revision":note.revision}));
        }
        if note.revision != expected {
            return Err("CONFLICT: Note changed on disk. Reload before saving.".into());
        }

        let (body, checked) = match edit {
            NoteEdit::Replace { body, .. } => (body, None),
            NoteEdit::Toggle { ordinal } => {
                let body = toggle_task(&note.body, ordinal).ok_or("Knowledge task not found.")?;
                let checked = note
                    .body
                    .as_bytes()
                    .iter()
                    .zip(body.as_bytes())
                    .find_map(|(previous, current)| {
                        (previous != current).then_some(*current == b'x')
                    })
                    .ok_or("Knowledge task could not be changed.")?;
                (body, Some(checked))
            }
        };
        let saved = documents::save(root, path, &body, expected).map_err(|error| {
            if error.starts_with("CONFLICT:") || error == "Note exceeds the 2 MiB limit." {
                error
            } else {
                eprintln!("External MCP could not save a vault note: {error}");
                "Knowledge note could not be saved.".into()
            }
        })?;

        inner.cache.remove(path);
        let mut result = json!({"path":path,"revision":saved.revision});
        if let Some(checked) = checked {
            result["checked"] = json!(checked);
        }
        Ok(result)
    }
}

fn authorized_root<'a>(state: &'a ConnectionState, id: &str) -> Result<&'a Path, String> {
    match state {
        ConnectionState::Ready(connection) if connection.id == id => {
            Ok(Path::new(&connection.root))
        }
        _ => Err(VAULT_NOT_FOUND.into()),
    }
}

fn external_read(root: &Path, path: &str) -> Result<VaultDocument, String> {
    documents::read(root, path).map_err(|_| NOTE_NOT_FOUND.into())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn external_edit_checks_revision_and_rejects_unsafe_paths() {
        let dir = tempfile::tempdir().unwrap();
        let canonical = dir.path().canonicalize().unwrap();
        let vault = canonical.join("vault");
        std::fs::create_dir(&vault).unwrap();
        std::fs::create_dir(vault.join(".hidden")).unwrap();
        for file in [".hidden/x.md", "note.md", "note.txt", "a\\b.md"] {
            std::fs::write(vault.join(file), "- [ ] Original\n").unwrap();
        }
        std::fs::write(canonical.join("outside.md"), "outside").unwrap();
        #[cfg(unix)]
        std::os::unix::fs::symlink(canonical.join("outside.md"), vault.join("link.md")).unwrap();

        let host = VaultHost::new();
        let connection = host.connect(&canonical, vault.to_str().unwrap()).unwrap();
        let replace = || NoteEdit::Replace {
            body: "changed".into(),
            resumed: false,
        };
        let original = host.external_read(&connection.id, "note.md").unwrap();

        for path in [
            "../outside.md",
            "/outside.md",
            ".hidden/x.md",
            "note.txt",
            "a\\b.md",
            "link.md",
        ] {
            assert_eq!(
                host.external_edit(&connection.id, path, &original.revision, replace()),
                Err(NOTE_NOT_FOUND.into())
            );
        }
        for edit in [replace(), NoteEdit::Toggle { ordinal: 0 }] {
            assert!(host
                .external_edit(&connection.id, "note.md", "stale", edit)
                .unwrap_err()
                .starts_with("CONFLICT:"));
        }
        assert_eq!(
            std::fs::read(vault.join("note.md")).unwrap(),
            original.body.as_bytes()
        );

        let toggled = host
            .external_edit(
                &connection.id,
                "note.md",
                &original.revision,
                NoteEdit::Toggle { ordinal: 0 },
            )
            .unwrap();
        assert_eq!(toggled["checked"], true);
        let retry = host
            .external_edit(
                &connection.id,
                "note.md",
                &original.revision,
                NoteEdit::Replace {
                    body: "- [x] Original\n".into(),
                    resumed: true,
                },
            )
            .unwrap();
        assert_eq!(retry["revision"], toggled["revision"]);
    }
}
