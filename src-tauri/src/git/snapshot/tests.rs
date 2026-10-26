use super::*;

use crate::test_support::{git, init_git, tmp};

#[test]
fn git_snapshot_tracks_head_and_dirty_files() {
    let dir = tmp("git-snapshot");
    if !init_git(&dir.0, "main", None) {
        return;
    }
    std::fs::write(dir.0.join("a.txt"), "one").unwrap();
    assert!(git(&dir.0, &["add", "."]) && git(&dir.0, &["commit", "-m", "init"]));

    let clean = git_snapshot_for(&dir.0).unwrap();
    std::fs::write(dir.0.join("b.txt"), "two").unwrap();
    std::fs::write(dir.0.join("a.txt"), "edited").unwrap();
    let dirty = git_snapshot_for(&dir.0).unwrap();
    std::fs::write(dir.0.join("a.txt"), "edited again").unwrap();
    std::fs::write(dir.0.join("b.txt"), "three").unwrap();
    let dirtier = git_snapshot_for(&dir.0).unwrap();

    assert_eq!(clean.head.len(), 40);
    assert!(clean.porcelain.is_empty());
    assert_eq!(dirty.head, clean.head);
    assert!(dirty.porcelain.contains("b.txt"));
    assert_eq!(dirtier.porcelain, dirty.porcelain);
    assert_ne!(dirtier.fingerprint, dirty.fingerprint);
    assert_eq!(
        git_snapshot_for(&dir.0).unwrap().fingerprint,
        dirtier.fingerprint
    );
}
