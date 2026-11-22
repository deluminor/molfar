use super::{from_markdown, to_markdown};
use serde_json::Value;
use std::{fs, path::PathBuf};

fn fixtures() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("src/atlassian/adf/fixtures")
}

#[test]
fn golden_files_match_markdown_exactly() {
    let mut seen = Vec::new();
    for entry in fs::read_dir(fixtures()).unwrap() {
        let path = entry.unwrap().path();
        if path.extension().is_none_or(|extension| extension != "json") {
            continue;
        }
        let doc: Value = serde_json::from_str(&fs::read_to_string(&path).unwrap()).unwrap();
        let expected = fs::read_to_string(path.with_extension("md"))
            .unwrap()
            .replace("\r\n", "\n");
        assert_eq!(to_markdown(&doc), expected.trim_end(), "{}", path.display());
        seen.push(path.file_stem().unwrap().to_string_lossy().into_owned());
    }
    seen.sort();
    assert_eq!(
        seen,
        [
            "bullet", "code", "combined", "date", "emoji", "expand", "heading", "link", "media",
            "mention", "ordered", "panel", "status", "table", "task", "unknown",
        ]
    );
}

#[test]
fn markdown_subset_round_trips() {
    let markdown = [
        "# Title",
        "",
        "Hello **bold** and _italic_ and ~~strike~~ and `code` and [link](https://example.com).",
        "",
        "line one",
        "line two",
        "",
        "- one",
        "- two",
        "",
        "1. first",
        "2. second",
        "",
        "- [ ] todo",
        "- [x] done",
        "",
        "```rust",
        "fn main() {}",
        "```",
        "",
        "> [!warning]",
        "> Watch out",
        "",
        "| A | B |",
        "| --- | --- |",
        "| 1 | 2 |",
    ]
    .join("\n");
    assert_eq!(to_markdown(&from_markdown(&markdown)), markdown);
}

#[test]
fn image_markdown_becomes_a_link_not_media() {
    let adf = from_markdown("![shot](https://example.com/a.png)");
    let raw = adf.to_string();
    assert!(raw.contains("https://example.com/a.png"));
    assert!(!raw.contains("\"media\""));
    assert!(!raw.contains("attachment://"));
}
