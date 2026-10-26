use super::*;

use std::path::Path;

use crate::test_support::tmp;

#[test]
fn split_stem_ext_keeps_dotfiles_whole() {
    assert_eq!(split_stem_ext("foo.ts"), ("foo", ".ts"));
    assert_eq!(split_stem_ext("foo.d.ts"), ("foo.d", ".ts"));
    assert_eq!(split_stem_ext(".gitignore"), (".gitignore", ""));
    assert_eq!(split_stem_ext("Makefile"), ("Makefile", ""));
}

#[test]
fn rename_delete_and_copy_round_trip() {
    let dir = tmp("tree");
    let file = dir.0.join("notes.md");
    std::fs::write(&file, "hi\n").unwrap();
    let file_s = file.to_string_lossy().into_owned();
    let parent = dir.0.to_string_lossy().into_owned();

    let renamed = rename_path_sync(&file_s, "readme.md").unwrap();
    assert!(Path::new(&renamed).ends_with("readme.md"));
    assert!(!file.exists());
    assert_eq!(std::fs::read_to_string(&renamed).unwrap(), "hi\n");

    let copied = copy_path_sync(&renamed, &parent).unwrap();
    assert!(Path::new(&copied).ends_with("readme copy.md"));
    assert_eq!(std::fs::read_to_string(&copied).unwrap(), "hi\n");

    let nested = dir.0.join("docs");
    std::fs::create_dir(&nested).unwrap();
    let moved = move_path_sync(&copied, &nested.to_string_lossy()).unwrap();
    assert!(Path::new(&moved).ends_with("docs/readme copy.md"));
    assert!(!Path::new(&copied).exists());

    delete_path_sync(&renamed).unwrap();
    assert!(!Path::new(&renamed).exists());
    delete_path_sync(&nested.to_string_lossy()).unwrap();
    assert!(!nested.exists());
}

#[test]
fn copy_folder_gets_a_unique_name_and_rejects_paste_into_self() {
    let dir = tmp("folder");
    let src = dir.0.join("src");
    std::fs::create_dir(&src).unwrap();
    std::fs::write(src.join("a.rs"), "fn a() {}\n").unwrap();
    let parent = dir.0.to_string_lossy().into_owned();
    let src_s = src.to_string_lossy().into_owned();

    let copied = copy_path_sync(&src_s, &parent).unwrap();
    assert!(Path::new(&copied).ends_with("src copy"));
    assert!(Path::new(&copied).join("a.rs").exists());

    let err = copy_path_sync(&src_s, &src_s).unwrap_err();
    assert!(err.contains("itself"));
}

#[cfg(unix)]
#[test]
fn copy_rejects_paste_into_self_through_a_symlink_alias() {
    let dir = tmp("folder-alias");
    let src = dir.0.join("src");
    std::fs::create_dir(&src).unwrap();
    std::fs::write(src.join("a.rs"), "fn a() {}\n").unwrap();
    let alias = dir.0.join("alias");
    std::os::unix::fs::symlink(&src, &alias).unwrap();
    let src_s = src.to_string_lossy().into_owned();
    let alias_s = alias.to_string_lossy().into_owned();

    let err = copy_path_sync(&src_s, &alias_s).unwrap_err();
    assert!(err.contains("itself"));
    let err = move_path_sync(&src_s, &alias_s).unwrap_err();
    assert!(err.contains("itself"));
}
