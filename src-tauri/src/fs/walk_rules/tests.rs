use super::*;

use crate::test_support::tmp;

#[test]
fn project_dirs_stay_indexable() {
    let dir = tmp("index-root");
    assert!(is_indexable_root(&dir.0));
}
