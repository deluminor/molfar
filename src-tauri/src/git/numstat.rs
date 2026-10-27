use std::collections::HashMap;
use std::path::Path;

use crate::fs::path_to_js;
use crate::git::command::git_run;
use crate::git::index::FileAcc;

pub(super) fn add_numstat_map(text: &str, files: &mut HashMap<String, FileAcc>) {
    // `git diff -z --numstat` ends each record with NUL. A rename is
    // `add <TAB> del <TAB> <NUL> old <NUL> new <NUL>`; every other record is
    // `add <TAB> del <TAB> path <NUL>`. The path itself may contain spaces,
    // quotes, tabs, or non-ASCII bytes, which a newline listing would C-quote.
    let mut fields = text.split('\0');
    while let Some(record) = fields.next() {
        if record.is_empty() {
            continue;
        }
        let mut parts = record.splitn(3, '\t');
        let Some(add) = parts.next() else { continue };
        let Some(del) = parts.next() else { continue };
        let Some(path) = parts.next() else { continue };
        let path = if path.is_empty() {
            let _previous = fields.next();
            match fields.next() {
                Some(destination) if !destination.is_empty() => destination,
                _ => continue,
            }
        } else {
            path
        };
        let relative = literal_diff_path(path);
        if relative.is_empty() {
            continue;
        }
        let entry = files.entry(relative).or_default();
        if add != "-" && del != "-" {
            entry.additions += add.parse::<i64>().unwrap_or(0);
            entry.deletions += del.parse::<i64>().unwrap_or(0);
        }
    }
}

pub(super) fn add_name_status(text: &str, statuses: &mut HashMap<String, &'static str>) {
    // `--no-renames -z` is `status <NUL> path <NUL>`, repeated.
    let mut fields = text.split('\0');
    while let Some(code) = fields.next() {
        if code.is_empty() {
            continue;
        }
        let Some(path) = fields.next() else {
            break;
        };
        let status = match code.as_bytes().first() {
            Some(b'A') => "added",
            Some(b'D') => "deleted",
            Some(b'M' | b'T') => "modified",
            _ => continue,
        };
        let relative = literal_diff_path(path);
        if !relative.is_empty() {
            statuses.insert(relative, status);
        }
    }
}

fn literal_diff_path(path: &str) -> String {
    let path = path.trim();
    if path.is_empty() {
        String::new()
    } else {
        path_to_js(Path::new(path))
    }
}

pub(super) fn normalize_diff_path(path: &str) -> String {
    let path = path.trim();
    if path.is_empty() {
        return String::new();
    }
    let path = if let Some((_, new)) = path.split_once(" => ") {
        new.trim_end_matches('}')
    } else {
        path
    };
    path_to_js(Path::new(path))
}

const MAX_UNTRACKED_BYTES: u64 = 1024 * 1024;

pub(super) fn add_untracked_map(root: &Path, files: &mut HashMap<String, FileAcc>) {
    let Some(stdout) = git_run(
        root,
        &["ls-files", "-o", "--exclude-standard", "-z", "--", "."],
    ) else {
        return;
    };
    for rel in stdout.split('\0') {
        if rel.is_empty() {
            continue;
        }
        let relative = path_to_js(Path::new(rel));
        let entry = files.entry(relative.clone()).or_default();
        entry.untracked = true;
        if entry.additions == 0 {
            entry.additions = text_line_count(&root.join(rel));
        }
    }
}

fn text_line_count(path: &Path) -> i64 {
    let Ok(meta) = std::fs::metadata(path) else {
        return 0;
    };
    if !meta.is_file() || meta.len() == 0 || meta.len() > MAX_UNTRACKED_BYTES {
        return 0;
    }
    let Ok(bytes) = std::fs::read(path) else {
        return 0;
    };
    if bytes.contains(&0) {
        return 0;
    }
    let mut lines = 1i64;
    for byte in &bytes {
        if *byte == b'\n' {
            lines += 1;
        }
    }
    if bytes.last() == Some(&b'\n') {
        lines -= 1;
    }
    lines
}

pub(super) fn mark_cached_and_unstaged(root: &Path, files: &mut HashMap<String, FileAcc>) {
    if let Some(names) = git_run(
        root,
        &[
            "diff",
            "-z",
            "--relative",
            "--cached",
            "--name-only",
            "--no-renames",
            "--",
            ".",
        ],
    ) {
        for line in names.split('\0') {
            let relative = literal_diff_path(line);
            if !relative.is_empty() {
                files.entry(relative).or_default().staged = true;
            }
        }
    }
    if let Some(names) = git_run(
        root,
        &[
            "diff",
            "-z",
            "--relative",
            "--name-only",
            "--no-renames",
            "--",
            ".",
        ],
    ) {
        for line in names.split('\0') {
            let relative = literal_diff_path(line);
            if !relative.is_empty() {
                files.entry(relative).or_default().unstaged = true;
            }
        }
    }
}
