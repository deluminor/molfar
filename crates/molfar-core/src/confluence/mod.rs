pub mod actions;
pub mod cache;
pub mod config;
pub mod connector;
pub mod document;
pub mod error;
pub mod http;
pub mod index;
mod media;
pub mod page;
pub mod resolve;
pub mod search;
pub mod spaces;
pub mod tree;

#[cfg(test)]
mod connector_tests;

#[cfg(test)]
mod boundary {
    use std::{fs, path::Path};

    #[test]
    fn confluence_sources_do_not_depend_on_the_tauri_connector() {
        visit(&Path::new(env!("CARGO_MANIFEST_DIR")).join("src/confluence"));
    }

    fn visit(dir: &Path) {
        for entry in fs::read_dir(dir).unwrap() {
            let path = entry.unwrap().path();
            if path.is_dir() {
                visit(&path);
                continue;
            }
            if path.extension().is_some_and(|ext| ext == "rs") {
                let text = fs::read_to_string(&path).unwrap();
                for needle in [["src", "-tauri"].concat(), ["src", "_tauri"].concat()] {
                    assert!(!text.contains(&needle), "{}", path.display());
                }
            }
        }
    }
}
