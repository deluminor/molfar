use super::{snapshot, tests::repository};
use std::os::unix::fs::symlink;

#[test]
fn untracked_symlinks_are_fingerprinted_by_target_not_followed() {
    let directory = tempfile::tempdir().unwrap();
    let root = directory.path();
    repository(root);
    std::fs::write(root.join("first"), "same\n").unwrap();
    std::fs::write(root.join("second"), "same\n").unwrap();
    symlink("first", root.join("link")).unwrap();
    let before = snapshot(root).unwrap();

    std::fs::remove_file(root.join("link")).unwrap();
    symlink("second", root.join("link")).unwrap();
    let after = snapshot(root).unwrap();

    assert_eq!(before.porcelain, after.porcelain);
    assert_ne!(before.fingerprint, after.fingerprint);
}

#[test]
fn untracked_symlink_to_a_device_is_not_read() {
    let directory = tempfile::tempdir().unwrap();
    let root = directory.path();
    repository(root);
    symlink("/dev/zero", root.join("zero")).unwrap();

    let snapshot = snapshot(root).unwrap();

    assert!(snapshot.porcelain.contains("zero"));
}
