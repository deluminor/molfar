use super::*;

use crate::fs::path_to_js;
use crate::test_support::tmp;

#[test]
fn project_location_follows_a_sibling_rename() {
    let parent = tmp("project-location-rename");
    let original = parent.0.join("molfar");
    let renamed = parent.0.join("molfar-personal");
    std::fs::create_dir(&original).unwrap();

    let first = resolve_project_location_sync(&path_to_js(&original), None)
        .unwrap()
        .unwrap();
    assert_eq!(first.path, path_to_js(&original));

    std::fs::rename(&original, &renamed).unwrap();
    let resolved = resolve_project_location_sync(&path_to_js(&original), Some(&first.identity))
        .unwrap()
        .unwrap();
    assert_eq!(resolved.path, path_to_js(&renamed));
    assert_eq!(resolved.identity, first.identity);
}

#[test]
fn project_location_does_not_guess_without_a_saved_identity() {
    let parent = tmp("project-location-missing");
    let missing = parent.0.join("old-name");
    std::fs::create_dir(parent.0.join("some-project")).unwrap();

    assert_eq!(
        resolve_project_location_sync(&path_to_js(&missing), None).unwrap(),
        None
    );
}
