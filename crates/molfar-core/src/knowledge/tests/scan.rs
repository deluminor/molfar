use super::super::*;
use super::Fixture;
use std::collections::HashMap;
use std::sync::atomic::AtomicBool;

#[test]
fn scans_tree_notes_frontmatter_attachments_and_cache_changes() {
    let fixture = Fixture::new();
    fixture.write("folder/alpha.md", "---\naliases: [First, 'A, B']\ntags:\n  - research\n  - nested/tag\n---\n[[Beta#Heading|label]] [Beta](../beta.md#heading) ![[image.png]]");
    fixture.write("beta.md", "Beta");
    fixture.write("image.png", "image");
    fixture.write(".obsidian/secret.md", "Hidden");
    let mut cache = HashMap::new();
    let snapshot = scan::scan(fixture.connection(), &mut cache, &AtomicBool::new(false)).unwrap();
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
    let updated = scan::scan(fixture.connection(), &mut cache, &AtomicBool::new(false)).unwrap();
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
    scan::scan(fixture.connection(), &mut cache, &AtomicBool::new(false)).unwrap();
    assert!(!cache.contains_key("beta.md"));
}

#[test]
fn oversized_notes_make_the_scan_explicitly_incomplete() {
    let fixture = Fixture::new();
    fixture.write(
        "oversized.md",
        &"x".repeat(constants::MAX_DOCUMENT_BYTES as usize + 1),
    );
    let snapshot = scan::scan(
        fixture.connection(),
        &mut HashMap::new(),
        &AtomicBool::new(false),
    )
    .unwrap();
    assert!(snapshot.truncated);
    assert!(snapshot.notes.is_empty());
    assert_eq!(snapshot.entries.len(), 1);
    assert!(!snapshot.warnings.is_empty());
}

#[test]
fn cancelled_scans_are_rejected() {
    let fixture = Fixture::new();
    assert!(scan::scan(
        fixture.connection(),
        &mut HashMap::new(),
        &AtomicBool::new(true)
    )
    .unwrap_err()
    .contains("cancelled"));
}

#[cfg(unix)]
#[test]
fn scans_skip_symbolic_links() {
    let fixture = Fixture::new();
    let outside = Fixture::new();
    outside.write("secret.md", "Secret");
    std::os::unix::fs::symlink(&outside.0, fixture.0.join("linked")).unwrap();
    let snapshot = scan::scan(
        fixture.connection(),
        &mut HashMap::new(),
        &AtomicBool::new(false),
    )
    .unwrap();
    assert!(snapshot.entries.is_empty());
    assert!(snapshot
        .warnings
        .iter()
        .any(|warning| warning.contains("symbolic link")));
}
