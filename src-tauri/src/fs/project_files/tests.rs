use super::*;

use std::path::Path;
use std::process::Command;
use std::sync::atomic::AtomicBool;

use crate::dirs_home;

use crate::fs::walk_rules::is_indexable_root;
use crate::git::ls_files::git_ls_files;
use crate::test_support::{init_git_commit, tmp};

fn relative_paths(files: &[ProjectFile]) -> Vec<&str> {
    files.iter().map(|f| f.relative.as_str()).collect()
}

#[test]
fn walk_skips_vendor_dirs_and_gitignore_names() {
    let dir = tmp("index-walk");
    std::fs::write(dir.0.join("app.ts"), "x\n").unwrap();
    std::fs::create_dir_all(dir.0.join("src")).unwrap();
    std::fs::write(dir.0.join("src").join("main.ts"), "x\n").unwrap();
    std::fs::create_dir_all(dir.0.join("node_modules").join("pkg")).unwrap();
    std::fs::write(
        dir.0.join("node_modules").join("pkg").join("index.js"),
        "x\n",
    )
    .unwrap();
    std::fs::write(dir.0.join(".gitignore"), "secret.txt\n").unwrap();
    std::fs::write(dir.0.join("secret.txt"), "nope\n").unwrap();

    let files = walk_project_files(&dir.0, WalkStop::Never);
    let paths = relative_paths(&files);
    assert!(paths.contains(&"app.ts"));
    assert!(paths.contains(&"src/main.ts"));
    assert!(paths.contains(&".gitignore"));
    assert!(!paths.iter().any(|r| r.contains("node_modules")));
    assert!(!paths.contains(&"secret.txt"));
}

#[test]
fn walk_stops_early_when_cancelled() {
    let dir = tmp("index-walk-cancelled");
    for index in 0..64 {
        std::fs::create_dir_all(dir.0.join(format!("dir{index}"))).unwrap();
        std::fs::write(dir.0.join(format!("dir{index}")).join("app.ts"), "x\n").unwrap();
    }
    let uncancelled = walk_project_files(&dir.0, WalkStop::Never);
    assert_eq!(uncancelled.len(), 64);

    let cancel = AtomicBool::new(true);
    assert!(walk_project_files(&dir.0, WalkStop::Flag(&cancel)).is_empty());
    // The same walk when nothing is cancelled must still see every file.
    let live = AtomicBool::new(false);
    assert_eq!(walk_project_files(&dir.0, WalkStop::Flag(&live)).len(), 64);
}

#[test]
fn walk_stops_between_entries_not_only_before_the_first_directory() {
    let dir = tmp("index-walk-midway");
    // Flat, so the entries the walk accepts are files: a tree of
    // directories would be pushed, not collected, and stopping midway would
    // still look empty.
    for index in 0..64 {
        std::fs::write(dir.0.join(format!("file{index}.ts")), "x\n").unwrap();
    }
    let all = walk_project_files(&dir.0, WalkStop::Never);
    assert_eq!(all.len(), 64);

    // Stopping partway through the first directory's entries is the only
    // outcome that distinguishes the per-entry check from the up-front one:
    // no up-front check yields all 64, a check that fires on the first
    // directory yields 0.
    let midway = walk_project_files(&dir.0, WalkStop::AfterEntries(5));
    assert!(
        !midway.is_empty() && midway.len() < all.len(),
        "expected a partial listing, got {} of {}",
        midway.len(),
        all.len()
    );
}

#[test]
fn walk_skips_app_bundles() {
    let dir = tmp("index-bundle");
    std::fs::write(dir.0.join("app.ts"), "x\n").unwrap();
    let bundle = dir.0.join("Some.app").join("Contents");
    std::fs::create_dir_all(&bundle).unwrap();
    std::fs::write(bundle.join("Info.plist"), "x\n").unwrap();

    let files = walk_project_files(&dir.0, WalkStop::Never);
    let paths = relative_paths(&files);
    assert!(paths.contains(&"app.ts"));
    assert!(!paths.iter().any(|r| r.contains("Some.app")));
}

#[test]
fn home_root_is_not_indexed() {
    let Some(home) = dirs_home() else { return };
    let files = list_project_files_sync(&home).unwrap();
    assert!(files.is_empty());
    assert!(list_project_files_sync("~").unwrap().is_empty());
    assert!(!is_indexable_root(Path::new("/")));
}

#[test]
fn git_ls_files_includes_untracked_and_drops_ignored() {
    let dir = tmp("index-git");
    std::fs::write(dir.0.join("tracked.ts"), "x\n").unwrap();
    std::fs::write(dir.0.join("loose.ts"), "x\n").unwrap();
    std::fs::write(dir.0.join(".gitignore"), "ignored.ts\nnode_modules\n").unwrap();
    std::fs::write(dir.0.join("ignored.ts"), "x\n").unwrap();
    std::fs::create_dir_all(dir.0.join("node_modules")).unwrap();
    std::fs::write(dir.0.join("node_modules").join("pkg.js"), "x\n").unwrap();

    let init = Command::new("git")
        .args(["init"])
        .current_dir(&dir.0)
        .output();
    let Ok(init) = init else { return };
    if !init.status.success() {
        return;
    }
    let add = Command::new("git")
        .args(["add", "tracked.ts", ".gitignore"])
        .current_dir(&dir.0)
        .status();
    if add.map(|s| !s.success()).unwrap_or(true) {
        return;
    }

    let files = list_project_files_sync(&dir.0.to_string_lossy()).unwrap();
    let paths = relative_paths(&files);
    assert!(paths.contains(&"tracked.ts"));
    assert!(paths.contains(&"loose.ts"));
    assert!(!paths.contains(&"ignored.ts"));
    assert!(!paths.iter().any(|r| r.contains("node_modules")));
}

#[test]
fn a_cancelled_git_listing_does_not_return_the_index() {
    let dir = tmp("index-git-cancel");
    if !init_git_commit(&dir.0, &[("tracked.ts", "x\n")]) {
        return;
    }
    let cancel = AtomicBool::new(true);
    assert!(
        git_ls_files(&dir.0, Some(&cancel)).is_none(),
        "cancelled ls-files must not look like a missing git index"
    );
    // The walk still sees the file, so falling through after a cancelled
    // `git_ls_files` would reintroduce the listing the cancel was meant
    // to drop.
    assert!(walk_project_files(&dir.0, WalkStop::Never)
        .iter()
        .any(|file| file.relative == "tracked.ts"));
    let files =
        list_project_files_sync_cancellable(&dir.0.to_string_lossy(), Some(&cancel)).unwrap();
    assert!(files.is_empty());
    assert!(git_ls_files(&dir.0, None)
        .unwrap()
        .iter()
        .any(|file| file.relative == "tracked.ts"));
}
