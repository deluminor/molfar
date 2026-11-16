use super::*;

use std::time::{SystemTime, UNIX_EPOCH};

use crate::fs::path_to_js;
use crate::fs::write::write_text_file_sync;
use crate::test_support::tmp;

#[test]
fn stat_files_returns_mtime_for_existing_files_only() {
    let dir = tmp("stat-files");
    let path = dir.0.join("notes.md");
    std::fs::write(&path, "hi\n").unwrap();
    let path_string = path.to_string_lossy().into_owned();
    let missing = dir.0.join("gone.md").to_string_lossy().into_owned();

    let stats = stat_files(vec![path_string.clone(), missing.clone()]).unwrap();
    assert_eq!(stats.len(), 2);
    assert_eq!(stats[0].path, path_string);
    assert!(stats[0].mtime_ms.is_some());
    assert_eq!(stats[1].path, missing);
    assert!(stats[1].mtime_ms.is_none());
}

#[test]
fn editor_text_files_round_trip_without_leaving_a_temporary_file() {
    let stamp = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap()
        .as_nanos();
    let dir = std::env::temp_dir().join(format!("molfar-editor-{}-{stamp}", std::process::id()));
    std::fs::create_dir_all(&dir).unwrap();
    let path = dir.join("example.rs");
    std::fs::write(&path, "fn old() {}\n").unwrap();
    let path_string = path.to_string_lossy().into_owned();

    assert_eq!(read_text_file_sync(&path_string).unwrap(), "fn old() {}\n");
    write_text_file_sync(&path_string, "fn new() {}\n").unwrap();
    assert_eq!(read_text_file_sync(&path_string).unwrap(), "fn new() {}\n");

    let names: Vec<_> = std::fs::read_dir(&dir)
        .unwrap()
        .map(|entry| entry.unwrap().file_name())
        .collect();
    assert_eq!(names, vec![std::ffi::OsString::from("example.rs")]);
    std::fs::remove_dir_all(dir).unwrap();
}

#[test]
fn inspect_paths_reports_files_and_directories() {
    let dir = tmp("inspect-paths");
    let file = dir.0.join("notes.md");
    std::fs::write(&file, "hello\n").unwrap();
    let infos = inspect_paths(vec![
        file.to_string_lossy().into_owned(),
        dir.0.to_string_lossy().into_owned(),
    ]);
    assert_eq!(infos.len(), 2);
    let notes = infos.iter().find(|info| info.name == "notes.md").unwrap();
    assert!(!notes.is_dir);
    assert_eq!(notes.size, 6);
    let folder = infos.iter().find(|info| info.is_dir).unwrap();
    assert_eq!(folder.path, path_to_js(&dir.0));
}
