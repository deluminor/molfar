//! The vault's folders and notes as flat, indented rows.
use molfar_core::knowledge::{VaultNote, note_matches};
use std::collections::{BTreeMap, HashSet};

#[derive(Clone, Debug, PartialEq, Eq)]
pub(crate) enum TreeRow {
    Folder {
        path: String,
        name: String,
        depth: usize,
        notes: usize,
        open: bool,
    },
    Note {
        path: String,
        title: String,
        depth: usize,
    },
}

#[derive(Default)]
struct Folder<'a> {
    folders: BTreeMap<String, Folder<'a>>,
    notes: Vec<&'a VaultNote>,
}

impl Folder<'_> {
    fn count(&self) -> usize {
        self.notes.len() + self.folders.values().map(Folder::count).sum::<usize>()
    }
}

/// Rows for the visible tree. Folders start closed; `expanded` holds the
/// open ones. A query opens every folder that holds a match and hides the rest.
pub(crate) fn rows(notes: &[VaultNote], query: &str, expanded: &HashSet<String>) -> Vec<TreeRow> {
    let needle = query.trim().to_lowercase();
    let mut root = Folder::default();
    for note in notes.iter().filter(|note| note_matches(note, &needle)) {
        let mut folder = &mut root;
        let mut parts: Vec<&str> = note.path.split('/').collect();
        parts.pop();
        for part in parts {
            folder = folder.folders.entry(part.to_string()).or_default();
        }
        folder.notes.push(note);
    }

    let mut out = Vec::new();
    flatten(&root, "", 0, !needle.is_empty(), expanded, &mut out);
    out
}

fn flatten(
    folder: &Folder,
    prefix: &str,
    depth: usize,
    searching: bool,
    expanded: &HashSet<String>,
    out: &mut Vec<TreeRow>,
) {
    let mut folders: Vec<_> = folder.folders.iter().collect();
    folders.sort_by_key(|(name, _)| name.to_lowercase());
    for (name, child) in folders {
        let path = if prefix.is_empty() {
            name.clone()
        } else {
            format!("{prefix}/{name}")
        };
        let open = searching || expanded.contains(&path);
        out.push(TreeRow::Folder {
            path: path.clone(),
            name: name.clone(),
            depth,
            notes: child.count(),
            open,
        });
        if open {
            flatten(child, &path, depth + 1, searching, expanded, out);
        }
    }

    let mut notes = folder.notes.clone();
    notes.sort_by_key(|note| note.title.to_lowercase());
    out.extend(notes.into_iter().map(|note| TreeRow::Note {
        path: note.path.clone(),
        title: note.title.clone(),
        depth,
    }));
}

/// The folders above a note, outermost first, to reveal it in the tree.
pub(crate) fn ancestors(path: &str) -> Vec<String> {
    let parts: Vec<&str> = path.split('/').collect();
    (1..parts.len()).map(|end| parts[..end].join("/")).collect()
}

/// Every folder that holds a note, for expanding the whole tree.
pub(crate) fn folders(notes: &[VaultNote]) -> HashSet<String> {
    notes
        .iter()
        .flat_map(|note| ancestors(&note.path))
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn note(path: &str, title: &str) -> VaultNote {
        VaultNote {
            path: path.into(),
            title: title.into(),
            aliases: Vec::new(),
            tags: Vec::new(),
            links: Vec::new(),
        }
    }

    fn vault() -> Vec<VaultNote> {
        vec![
            note("Home.md", "Home"),
            note("Work/plan.md", "Plan"),
            note("Work/Deep/idea.md", "Idea"),
            note("Areas/health.md", "Health"),
        ]
    }

    fn labels(rows: &[TreeRow]) -> Vec<String> {
        rows.iter()
            .map(|row| match row {
                TreeRow::Folder {
                    name, depth, notes, ..
                } => format!("{depth}:{name}/({notes})"),
                TreeRow::Note { title, depth, .. } => format!("{depth}:{title}"),
            })
            .collect()
    }

    #[test]
    fn folders_start_closed_and_expanded_ones_list_children_sorted() {
        assert_eq!(
            labels(&rows(&vault(), "", &HashSet::new())),
            ["0:Areas/(1)", "0:Work/(2)", "0:Home"]
        );
        let rows = rows(&vault(), "", &folders(&vault()));
        assert_eq!(
            labels(&rows),
            [
                "0:Areas/(1)",
                "1:Health",
                "0:Work/(2)",
                "1:Deep/(1)",
                "2:Idea",
                "1:Plan",
                "0:Home"
            ]
        );
    }

    #[test]
    fn expanding_a_folder_keeps_its_subfolders_closed() {
        let expanded = HashSet::from(["Work".to_string()]);
        let rows = rows(&vault(), "", &expanded);
        assert_eq!(
            labels(&rows),
            [
                "0:Areas/(1)",
                "0:Work/(2)",
                "1:Deep/(1)",
                "1:Plan",
                "0:Home"
            ]
        );
        assert!(matches!(&rows[2], TreeRow::Folder { open: false, .. }));
    }

    #[test]
    fn a_query_opens_matching_folders_and_drops_the_rest() {
        let rows = rows(&vault(), "IDE", &HashSet::new());
        assert_eq!(labels(&rows), ["0:Work/(1)", "1:Deep/(1)", "2:Idea"]);
        assert_eq!(ancestors("Work/Deep/idea.md"), ["Work", "Work/Deep"]);
    }
}
