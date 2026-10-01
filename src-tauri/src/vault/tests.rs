use super::{documents, parse, paths, scan, state, types};
use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::atomic::AtomicBool;

struct Fixture(PathBuf);

impl Fixture {
    fn new() -> Self {
        let root = std::env::temp_dir()
            .canonicalize()
            .unwrap()
            .join(format!("monocode-vault-test-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir(&root).unwrap();
        Self(root)
    }

    fn connection(&self) -> types::VaultConnection {
        types::VaultConnection {
            id: "fixture".into(),
            root: self.0.to_string_lossy().into_owned(),
            name: "Fixture".into(),
        }
    }

    fn write(&self, path: &str, body: &str) {
        let destination = self.0.join(path);
        std::fs::create_dir_all(destination.parent().unwrap()).unwrap();
        std::fs::write(destination, body).unwrap();
    }
}

impl Drop for Fixture {
    fn drop(&mut self) {
        if let Err(error) = std::fs::remove_dir_all(&self.0) {
            eprintln!("vault test cleanup: {error}");
        }
    }
}

#[test]
fn read_and_save_preserve_frontmatter_and_reject_external_changes() {
    let fixture = Fixture::new();
    let body = "---\nunknown: [keep, me]\n---\n# Original\r\n";
    fixture.write("note.md", body);
    let original = documents::read(&fixture.0, "note.md").unwrap();
    assert_eq!(original.body, body);
    let edited = format!("{body}Edited");
    let saved = documents::save(&fixture.0, "note.md", &edited, &original.revision).unwrap();
    assert_ne!(saved.revision, original.revision);
    assert_eq!(
        std::fs::read_to_string(fixture.0.join("note.md")).unwrap(),
        edited
    );
    fixture.write("note.md", "External edit");
    assert!(
        documents::save(&fixture.0, "note.md", "Overwrite", &saved.revision)
            .unwrap_err()
            .starts_with("CONFLICT:")
    );
    assert_eq!(
        std::fs::read_to_string(fixture.0.join("note.md")).unwrap(),
        "External edit"
    );
}

#[test]
fn paths_reject_traversal_hidden_and_absolute_paths() {
    let fixture = Fixture::new();
    fixture.write("folder/note.md", "Note");
    fixture.write(".obsidian/config.md", "Hidden");
    for path in [
        "../escape.md",
        "/outside.md",
        "folder/../../escape.md",
        ".obsidian/config.md",
        "folder\\note.md",
        "",
    ] {
        assert!(paths::resolve(&fixture.0, path).is_err(), "{path}");
    }
    assert!(paths::resolve(&fixture.0, "folder/note.md")
        .unwrap()
        .starts_with(&fixture.0));
}

#[cfg(unix)]
#[test]
fn paths_and_scans_reject_symbolic_links() {
    let fixture = Fixture::new();
    let outside = Fixture::new();
    outside.write("secret.md", "Secret");
    std::os::unix::fs::symlink(&outside.0, fixture.0.join("linked")).unwrap();
    assert!(paths::resolve(&fixture.0, "linked/secret.md").is_err());
    assert!(paths::validate_root(&fixture.0.join("linked")).is_err());
    let snapshot = scan::scan(
        fixture.connection(),
        &mut HashMap::new(),
        &AtomicBool::new(false),
        |_| {},
    )
    .unwrap();
    assert!(snapshot.entries.is_empty());
    assert!(snapshot
        .warnings
        .iter()
        .any(|warning| warning.contains("symbolic link")));
}

#[test]
fn scans_tree_notes_frontmatter_attachments_and_cache_changes() {
    let fixture = Fixture::new();
    fixture.write("folder/alpha.md", "---\naliases: [First, 'A, B']\ntags:\n  - research\n  - nested/tag\n---\n[[Beta#Heading|label]] [Beta](../beta.md#heading) ![[image.png]]");
    fixture.write("beta.md", "Beta");
    fixture.write("image.png", "image");
    fixture.write(".obsidian/secret.md", "Hidden");
    let mut cache = HashMap::new();
    let snapshot = scan::scan(
        fixture.connection(),
        &mut cache,
        &AtomicBool::new(false),
        |_| {},
    )
    .unwrap();
    assert_eq!(snapshot.entries.len(), 4);
    assert_eq!(snapshot.notes.len(), 2);
    assert!(!snapshot.truncated);
    let note = snapshot
        .notes
        .iter()
        .find(|note| note.path == "folder/alpha.md")
        .unwrap();
    assert_eq!(note.aliases, ["A, B", "First"]);
    assert!(note.tags.contains(&"nested/tag".into()));
    assert_eq!(note.links.len(), 3);
    fixture.write("beta.md", "[[Changed link]] and a longer document");
    let updated = scan::scan(
        fixture.connection(),
        &mut cache,
        &AtomicBool::new(false),
        |_| {},
    )
    .unwrap();
    assert_eq!(
        updated
            .notes
            .iter()
            .find(|note| note.path == "beta.md")
            .unwrap()
            .links[0]
            .target,
        "Changed link"
    );
    std::fs::remove_file(fixture.0.join("beta.md")).unwrap();
    scan::scan(
        fixture.connection(),
        &mut cache,
        &AtomicBool::new(false),
        |_| {},
    )
    .unwrap();
    assert!(!cache.contains_key("beta.md"));
}

#[test]
fn links_ignore_fenced_indented_inline_code_and_html_comments() {
    let body = "[[Visible]]\n\n```md\n[[Fence]] [fake](fake.md)\n```\n\n    [[Indent]]\n\n`[[Inline]]`\n\n<!-- [[Comment]] -->\n\n[reference][ref]\n\n[ref]: target.md\n";
    let (note, warning) = parse::parse_note("note.md", body);
    assert!(warning.is_none());
    let targets: Vec<_> = note.links.iter().map(|link| link.target.as_str()).collect();
    assert_eq!(targets, ["target.md", "Visible"]);
}

#[test]
fn malformed_frontmatter_and_missing_notes_report_errors() {
    let (note, warning) = parse::parse_note("note.md", "---\naliases: [bad\n---\n[[Visible]]");
    assert!(warning.is_some());
    assert_eq!(note.links[0].target, "Visible");
    let fixture = Fixture::new();
    assert!(documents::read(&fixture.0, "missing.md").is_err());
    fixture.write("image.png", "Image");
    assert!(documents::read(&fixture.0, "image.png").is_err());
}

#[test]
fn oversized_notes_are_bounded_and_incomplete_scans_are_explicit() {
    let fixture = Fixture::new();
    fixture.write(
        "oversized.md",
        &"x".repeat(super::constants::MAX_DOCUMENT_BYTES as usize + 1),
    );
    assert!(documents::read(&fixture.0, "oversized.md").is_err());
    let snapshot = scan::scan(
        fixture.connection(),
        &mut HashMap::new(),
        &AtomicBool::new(false),
        |_| {},
    )
    .unwrap();
    assert!(snapshot.truncated);
    assert!(snapshot.notes.is_empty());
    assert_eq!(snapshot.entries.len(), 1);
    assert!(!snapshot.warnings.is_empty());
}

#[test]
fn cancelled_scans_and_stale_ids_are_rejected() {
    let fixture = Fixture::new();
    assert!(scan::scan(
        fixture.connection(),
        &mut HashMap::new(),
        &AtomicBool::new(true),
        |_| {}
    )
    .unwrap_err()
    .contains("cancelled"));
    let inner = types::VaultInner {
        connection: Some(fixture.connection()),
        ..Default::default()
    };
    assert!(state::connection(&inner, "stale").is_err());
    assert_eq!(state::connection(&inner, "fixture").unwrap().id, "fixture");
}

#[test]
fn quoted_yaml_aliases_tags_and_unicode_links_are_preserved() {
    let (note, warning) = parse::parse_note("Нотатка.md", "---\ntitle: 'Knowledge: graph'\naliases: 'Alias # literal'\ntags: [research, 'nested/tag']\n---\n[[Ідея#Розділ]] [Go](<folder/Two words.md>) #topic");
    assert!(warning.is_none());
    assert_eq!(note.title, "Knowledge: graph");
    assert_eq!(note.aliases, ["Alias # literal"]);
    assert!(note.tags.contains(&"topic".into()));
    assert!(note.links.iter().any(|link| link.target == "Ідея#Розділ"));
    assert!(note
        .links
        .iter()
        .any(|link| link.target == "folder/Two words.md"));
}
