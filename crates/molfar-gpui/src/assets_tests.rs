use super::*;
use std::{fs, path::Path};

fn unresolved_icons(path: &Path) -> Vec<String> {
    let mut missing = Vec::new();
    for entry in fs::read_dir(path).unwrap() {
        let path = entry.unwrap().path();
        if path.is_dir() {
            missing.extend(unresolved_icons(&path));
        } else if path.extension().is_some_and(|ext| ext == "rs") {
            let text = fs::read_to_string(&path).unwrap();
            for (offset, _) in text.match_indices("icon") {
                if text[..offset]
                    .chars()
                    .next_back()
                    .is_some_and(|c| c == '_' || c.is_alphanumeric())
                {
                    continue;
                }
                let name = text[offset + "icon".len()..]
                    .trim_start()
                    .strip_prefix('(')
                    .and_then(|args| args.trim_start().strip_prefix('"'))
                    .and_then(|literal| literal.split_once('"').map(|(name, _)| name));
                if let Some(name) = name.filter(|name| Assets.load(name).unwrap().is_none()) {
                    missing.push(format!("{}: {name}", path.display()));
                }
            }
        }
    }
    missing
}

#[test]
fn every_icon_literal_resolves() {
    let missing = unresolved_icons(&Path::new(env!("CARGO_MANIFEST_DIR")).join("src"));
    assert!(missing.is_empty(), "{missing:?}");
}

#[test]
fn unknown_icon_is_missing() {
    assert!(Assets.load("unknown-molfar-icon").unwrap().is_none());
}
