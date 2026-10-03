use super::paths::{is_markdown, validate_connection_id};
use std::path::Path;

#[test]
fn markdown_extensions_are_case_insensitive_and_supported_consistently() {
    for path in ["note.md", "note.MD", "note.markdown", "note.Markdown"] {
        assert!(is_markdown(Path::new(path)), "{path}");
    }
    for path in ["note.txt", "note.md.png", "markdown", "note"] {
        assert!(!is_markdown(Path::new(path)), "{path}");
    }
}

#[test]
fn persisted_connection_ids_cannot_escape_the_asset_cache() {
    let canonical = "11111111-aaaa-4444-bbbb-111111111111";
    assert!(validate_connection_id(canonical).is_ok());
    for id in [
        "../escape",
        "/absolute",
        "..\\escape",
        "",
        "not-a-uuid",
        "urn:uuid:11111111-aaaa-4444-bbbb-111111111111",
        "11111111-AAAA-4444-BBBB-111111111111",
    ] {
        assert!(validate_connection_id(id).is_err(), "{id}");
    }
}
