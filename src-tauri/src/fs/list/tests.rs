use super::*;

use std::path::Path;
use std::process::Command;

use crate::test_support::tmp;

fn ignored_names(entries: &[DirEntry]) -> Vec<String> {
    entries
        .iter()
        .filter(|e| e.ignored)
        .map(|e| e.name.clone())
        .collect()
}

fn is_ignored(dir: &Path, name: &str) -> bool {
    ignored_names(&list_dir_sync(dir).unwrap())
        .iter()
        .any(|n| n == name)
}

#[test]
fn list_dir_sorts_numbered_names_naturally_with_folders_first() {
    let dir = tmp("list-dir-natural-sort");
    for name in [
        "chapter-100.md",
        "chapter-11.md",
        "chapter-09.md",
        "chapter-10.md",
        "Chapter-2.md",
    ] {
        std::fs::write(dir.0.join(name), "").unwrap();
    }
    for name in ["volume-10", "volume-2"] {
        std::fs::create_dir(dir.0.join(name)).unwrap();
    }

    let names: Vec<_> = list_dir_sync(&dir.0)
        .unwrap()
        .into_iter()
        .map(|entry| entry.name)
        .collect();
    assert_eq!(
        names,
        [
            "volume-2",
            "volume-10",
            "Chapter-2.md",
            "chapter-09.md",
            "chapter-10.md",
            "chapter-11.md",
            "chapter-100.md",
        ]
    );
}

#[test]
fn natural_name_sort_handles_multiple_and_large_numbers() {
    let mut names = [
        "part-2-chapter-10",
        "part-10-chapter-1",
        "part-2-chapter-2",
        "part-2-chapter-999999999999999999999999999999",
    ];
    names.sort_by(|a, b| compare_natural_names(a, b));
    assert_eq!(
        names,
        [
            "part-2-chapter-2",
            "part-2-chapter-10",
            "part-2-chapter-999999999999999999999999999999",
            "part-10-chapter-1",
        ]
    );
}

#[test]
fn list_dir_marks_ignored_with_git_semantics() {
    let dir = tmp("list-dir-git");
    let init = Command::new("git")
        .args(["init"])
        .current_dir(&dir.0)
        .output();
    let Ok(init) = init else { return };
    if !init.status.success() {
        return;
    }
    std::fs::write(
        dir.0.join(".gitignore"),
        "*.zzlog\n!keep.zzlog\n/zz-dist\nzz-build/\nnested/*.zztmp\n",
    )
    .unwrap();
    std::fs::write(dir.0.join("a.zzlog"), "x\n").unwrap();
    std::fs::write(dir.0.join("keep.zzlog"), "x\n").unwrap();
    std::fs::write(dir.0.join("zz-build"), "x\n").unwrap();
    std::fs::create_dir_all(dir.0.join("zz-dist")).unwrap();
    std::fs::create_dir_all(dir.0.join("src").join("zz-dist")).unwrap();
    std::fs::create_dir_all(dir.0.join("nested")).unwrap();
    std::fs::write(dir.0.join("nested").join("x.zztmp"), "x\n").unwrap();
    std::fs::write(dir.0.join("nested").join("x.txt"), "x\n").unwrap();

    assert!(is_ignored(&dir.0, ".git"));
    assert!(is_ignored(&dir.0, "a.zzlog"));
    assert!(!is_ignored(&dir.0, "keep.zzlog"));
    assert!(is_ignored(&dir.0, "zz-dist"));
    assert!(!is_ignored(&dir.0.join("src"), "zz-dist"));
    assert!(!is_ignored(&dir.0, "zz-build"));
    assert!(is_ignored(&dir.0.join("nested"), "x.zztmp"));
    assert!(!is_ignored(&dir.0.join("nested"), "x.txt"));
}

#[test]
fn list_dir_falls_back_to_name_parser_outside_git() {
    let dir = tmp("list-dir-plain");
    std::fs::write(dir.0.join(".gitignore"), "secret.txt\n*.log\n").unwrap();
    std::fs::write(dir.0.join("secret.txt"), "x\n").unwrap();
    std::fs::write(dir.0.join("a.log"), "x\n").unwrap();
    std::fs::write(dir.0.join("app.ts"), "x\n").unwrap();

    let mut ignored = ignored_names(&list_dir_sync(&dir.0).unwrap());
    ignored.sort_unstable();
    assert_eq!(ignored, vec!["a.log", "secret.txt"]);
}
