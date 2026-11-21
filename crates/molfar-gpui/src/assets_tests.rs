use super::*;
use std::{fs, path::Path};

fn unresolved_literals(parser: &mut tree_sitter::Parser, source: &str) -> Vec<String> {
    fn visit(node: tree_sitter::Node, source: &str, missing: &mut Vec<String>) {
        if node.kind() == "call_expression"
            && let Some(function) = node.child_by_field_name("function")
            && function
                .utf8_text(source.as_bytes())
                .is_ok_and(|name| name.rsplit("::").next() == Some("icon"))
            && let Some(arguments) = node.child_by_field_name("arguments")
        {
            let mut cursor = arguments.walk();
            if let Some(literal) = arguments
                .named_children(&mut cursor)
                .find(|child| !child.is_extra())
                .filter(|child| matches!(child.kind(), "string_literal" | "raw_string_literal"))
            {
                let mut cursor = literal.walk();
                if let Some(body) = literal
                    .named_children(&mut cursor)
                    .find(|child| child.kind() == "string_content")
                {
                    let name = body.utf8_text(source.as_bytes()).unwrap();
                    if Assets.load(name).unwrap().is_none() {
                        missing.push(format!("{}: {name}", literal.start_position().row + 1));
                    }
                }
            }
        }

        let mut cursor = node.walk();
        for child in node.named_children(&mut cursor) {
            visit(child, source, missing);
        }
    }

    let tree = parser.parse(source, None).unwrap();
    let mut missing = Vec::new();
    visit(tree.root_node(), source, &mut missing);
    missing
}

fn parser() -> tree_sitter::Parser {
    let mut parser = tree_sitter::Parser::new();
    parser
        .set_language(&tree_sitter_rust::LANGUAGE.into())
        .unwrap();
    parser
}

fn unresolved_icons(parser: &mut tree_sitter::Parser, path: &Path) -> Vec<String> {
    let mut missing = Vec::new();
    for entry in fs::read_dir(path).unwrap() {
        let path = entry.unwrap().path();
        if path.is_dir() {
            missing.extend(unresolved_icons(parser, &path));
        } else if path.extension().is_some_and(|ext| ext == "rs") {
            for problem in unresolved_literals(parser, &fs::read_to_string(&path).unwrap()) {
                missing.push(format!("{}:{problem}", path.display()));
            }
        }
    }
    missing
}

#[test]
fn every_icon_literal_resolves() {
    let missing = unresolved_icons(
        &mut parser(),
        &Path::new(env!("CARGO_MANIFEST_DIR")).join("src"),
    );
    assert!(missing.is_empty(), "{missing:?}");
}

#[test]
fn every_settings_icon_resolves() {
    use crate::settings::Section;
    assert_eq!(Section::Secrets.icon(), "key");
    for section in Section::ALL {
        let icon = section.icon();
        assert!(Assets.load(icon).unwrap().is_some(), "{icon}");
    }
}

#[test]
fn guard_detects_an_unknown_icon_and_skips_comments_and_strings() {
    let source = r##"
        fn fixture() {
            // icon("ignored-comment", 12.);
            let _ = r#"icon("ignored-string", 12.)"#;
            theme::icon(
                /* spacing */ "unknown-molfar-icon", 12.,
            );
        }
    "##;
    assert_eq!(
        unresolved_literals(&mut parser(), source),
        ["6: unknown-molfar-icon"]
    );
}
