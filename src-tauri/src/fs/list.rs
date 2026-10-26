use std::path::Path;

use serde::Serialize;

use crate::fs::walk_rules::Ignore;
use crate::fs::{expand_home, path_to_js};
use crate::git::ls_files::git_ignored_names;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DirEntry {
    name: String,
    path: String,
    is_dir: bool,
    ignored: bool,
}

/// Immediate children of `path` (project tree). Folders first, then files.
#[tauri::command(async)]
pub fn list_dir(path: String) -> Result<Vec<DirEntry>, String> {
    list_dir_sync(&expand_home(&path))
}

pub(crate) fn list_dir_sync(dir: &Path) -> Result<Vec<DirEntry>, String> {
    let reader = std::fs::read_dir(dir).map_err(|e| format!("{}: {e}", dir.display()))?;

    let mut out = Vec::new();
    for ent in reader {
        let Ok(ent) = ent else { continue };
        let name = ent.file_name();
        let Some(name) = name.to_str() else { continue };
        if name == ".DS_Store" {
            continue;
        }
        let path = ent.path();
        let is_dir = ent
            .file_type()
            .map(|t| t.is_dir() || (t.is_symlink() && path.is_dir()))
            .unwrap_or_else(|_| path.is_dir());
        out.push(DirEntry {
            ignored: false,
            name: name.to_string(),
            path: path_to_js(&path),
            is_dir,
        });
    }

    let names: Vec<&str> = out.iter().map(|e| e.name.as_str()).collect();
    let ignored = git_ignored_names(dir, &names).unwrap_or_else(|| {
        let ignore = Ignore::load(dir);
        names
            .iter()
            .filter(|n| ignore.matches(n))
            .map(|n| n.to_string())
            .collect()
    });
    for entry in &mut out {
        entry.ignored = entry.name == ".git" || ignored.contains(&entry.name);
    }

    out.sort_by(|a, b| {
        b.is_dir
            .cmp(&a.is_dir)
            .then_with(|| compare_natural_names(&a.name, &b.name))
    });
    Ok(out)
}

fn compare_natural_names(a: &str, b: &str) -> std::cmp::Ordering {
    use std::cmp::Ordering;

    let (a, b) = (a.as_bytes(), b.as_bytes());
    let (mut i, mut j) = (0, 0);
    while i < a.len() && j < b.len() {
        if a[i].is_ascii_digit() && b[j].is_ascii_digit() {
            let a_start = i;
            let b_start = j;
            while i < a.len() && a[i].is_ascii_digit() {
                i += 1;
            }
            while j < b.len() && b[j].is_ascii_digit() {
                j += 1;
            }
            let a_digits = &a[a_start..i];
            let b_digits = &b[b_start..j];
            let a_value = a_digits
                .iter()
                .position(|digit| *digit != b'0')
                .map_or(&a_digits[a_digits.len()..], |start| &a_digits[start..]);
            let b_value = b_digits
                .iter()
                .position(|digit| *digit != b'0')
                .map_or(&b_digits[b_digits.len()..], |start| &b_digits[start..]);
            let order = a_value
                .len()
                .cmp(&b_value.len())
                .then_with(|| a_value.cmp(b_value));
            if order != Ordering::Equal {
                return order;
            }
        } else {
            let order = a[i].to_ascii_lowercase().cmp(&b[j].to_ascii_lowercase());
            if order != Ordering::Equal {
                return order;
            }
            i += 1;
            j += 1;
        }
    }
    (a.len() - i).cmp(&(b.len() - j)).then_with(|| a.cmp(b))
}

#[cfg(test)]
mod tests;
