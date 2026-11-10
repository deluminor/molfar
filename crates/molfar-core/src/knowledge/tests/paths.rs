use super::super::*;
use super::Fixture;
use std::path::Path;

#[test]
fn markdown_extensions_are_case_insensitive() {
    for path in ["note.md", "note.MD", "note.markdown", "note.Markdown"] {
        assert!(paths::is_markdown(Path::new(path)), "{path}");
    }
    for path in ["note.txt", "note.md.png", "markdown", "note"] {
        assert!(!paths::is_markdown(Path::new(path)), "{path}");
    }
}

#[test]
fn persisted_connection_ids_cannot_escape() {
    let canonical = "11111111-aaaa-4444-bbbb-111111111111";
    assert!(paths::validate_connection_id(canonical).is_ok());
    for id in [
        "../escape",
        "/absolute",
        "..\\escape",
        "",
        "not-a-uuid",
        "urn:uuid:11111111-aaaa-4444-bbbb-111111111111",
        "11111111-AAAA-4444-BBBB-111111111111",
    ] {
        assert!(paths::validate_connection_id(id).is_err(), "{id}");
    }
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
fn paths_reject_symbolic_links() {
    let fixture = Fixture::new();
    let outside = Fixture::new();
    outside.write("secret.md", "Secret");
    std::os::unix::fs::symlink(&outside.0, fixture.0.join("linked")).unwrap();
    assert!(paths::resolve(&fixture.0, "linked/secret.md").is_err());
    assert!(paths::validate_root(&fixture.0.join("linked")).is_err());
}
