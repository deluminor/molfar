use super::super::*;

#[test]
fn links_ignore_fenced_indented_inline_code_and_html_comments() {
    let body = "[[Visible]]\n\n```md\n[[Fence]] [fake](fake.md)\n```\n\n    [[Indent]]\n\n`[[Inline]]`\n\n<!-- [[Comment]] -->\n\n[reference][ref]\n\n[ref]: target.md\n";
    let (note, warning) = parse::parse_note("note.md", body);
    assert!(warning.is_none());
    let targets: Vec<_> = note.links.iter().map(|link| link.target.as_str()).collect();
    assert_eq!(targets, ["target.md", "Visible"]);
}

#[test]
fn malformed_frontmatter_keeps_the_visible_link() {
    let (note, warning) = parse::parse_note("note.md", "---\naliases: [bad\n---\n[[Visible]]");
    assert!(warning.is_some());
    assert_eq!(note.links[0].target, "Visible");
}

#[test]
fn quoted_yaml_aliases_tags_and_unicode_links_are_preserved() {
    let (note, warning) = parse::parse_note(
        "Нотатка.md",
        "---\ntitle: 'Knowledge: graph'\naliases: 'Alias # literal'\ntags: [research, 'nested/tag']\n---\n[[Ідея#Розділ]] [Go](<folder/Two words.md>) #topic",
    );
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

#[test]
fn escaped_wiki_links_are_not_indexed() {
    let (note, _) = parse::parse_note("note.md", r"\[[Skipped]] [[Kept]]");
    assert_eq!(note.links.len(), 1);
    assert_eq!(note.links[0].target, "Kept");
}

#[test]
fn table_escaped_wiki_aliases_drop_the_backslash() {
    let (note, _) = parse::parse_note("Home.md", "| [[Dashboard\\|Board]] |\n");
    assert_eq!(note.links[0].target, "Dashboard");
}
