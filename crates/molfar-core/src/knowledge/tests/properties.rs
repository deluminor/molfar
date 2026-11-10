use super::super::*;

#[test]
fn frontmatter_becomes_ordered_properties_and_is_removed_from_the_body() {
    let body = "---\naliases:\n  - Dashboard\n  - Панель\ntags: [type/moc]\nbanner_x: 0.5\ndraft: true\nempty:\n---\n# Title\n";
    let (properties, rest) = note_properties(body);
    assert_eq!(rest, "# Title\n");
    let keys: Vec<_> = properties
        .iter()
        .map(|property| property.key.as_str())
        .collect();
    assert!(keys.contains(&"aliases") && keys.contains(&"banner_x"));
    let aliases = properties
        .iter()
        .find(|property| property.key == "aliases")
        .unwrap();
    assert!(aliases.list);
    assert_eq!(aliases.values, ["Dashboard", "Панель"]);
    let banner = properties
        .iter()
        .find(|property| property.key == "banner_x")
        .unwrap();
    assert_eq!(banner.values, ["0.5"]);
    let empty = properties
        .iter()
        .find(|property| property.key == "empty")
        .unwrap();
    assert!(empty.values.is_empty());
}

#[test]
fn notes_without_or_with_broken_frontmatter_keep_their_body() {
    assert_eq!(note_properties("# Plain\n"), (Vec::new(), "# Plain\n"));
    let broken = "---\ntitle: [unclosed\n---\nBody\n";
    assert_eq!(note_properties(broken), (Vec::new(), broken));
    let unclosed = "---\ntitle: x\nBody\n";
    assert_eq!(note_properties(unclosed).1, unclosed);
}
