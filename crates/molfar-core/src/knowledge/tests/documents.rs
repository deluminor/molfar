use super::super::*;
use super::Fixture;

#[test]
fn revision_is_sha256_hex_of_the_bytes() {
    assert_eq!(
        documents::revision(b"hello"),
        "2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824"
    );
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
fn a_change_between_the_check_and_the_rename_is_rejected() {
    let fixture = Fixture::new();
    fixture.write("note.md", "one");
    let original = documents::read(&fixture.0, "note.md").unwrap();
    let destination = paths::resolve(&fixture.0, "note.md").unwrap();
    fixture.write("note.md", "two");
    let error =
        documents::unchanged(&fixture.0, "note.md", &destination, &original.revision).unwrap_err();
    assert!(error.starts_with("CONFLICT:"));
    let before = std::fs::read(&destination).unwrap();
    let failed = documents::atomic_write(&destination, b"three", || Err(error.clone()));
    assert!(failed.unwrap_err().starts_with("CONFLICT:"));
    assert_eq!(std::fs::read(&destination).unwrap(), before);
    assert!(destination
        .parent()
        .unwrap()
        .read_dir()
        .unwrap()
        .all(|entry| !entry
            .unwrap()
            .file_name()
            .to_string_lossy()
            .contains(".molfar-")));
}

#[test]
fn non_utf8_and_non_markdown_notes_are_rejected() {
    let fixture = Fixture::new();
    fixture.write_bytes("note.md", &[0xff, 0xfe]);
    assert!(documents::read(&fixture.0, "note.md")
        .unwrap_err()
        .contains("not UTF-8"));
    fixture.write("image.png", "Image");
    assert!(documents::read(&fixture.0, "image.png").is_err());
    assert!(documents::read(&fixture.0, "missing.md").is_err());
}

#[test]
fn oversized_notes_are_rejected() {
    let fixture = Fixture::new();
    fixture.write(
        "oversized.md",
        &"x".repeat(constants::MAX_DOCUMENT_BYTES as usize + 1),
    );
    assert!(documents::read(&fixture.0, "oversized.md")
        .unwrap_err()
        .contains("2 MiB"));
}
