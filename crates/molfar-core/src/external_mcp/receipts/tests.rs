use super::*;
use serde_json::json;

#[test]
fn receipts_reserve_replay_and_reject_changed_input() {
    let store = Store::open(std::path::Path::new(":memory:")).unwrap();
    let first = digest(
        "board_create",
        &json!({"title":"A","requestId":"r","b":[1]}),
    );
    let same = digest(
        "board_create",
        &json!({"b":[1],"requestId":"x","title":"A"}),
    );
    let changed = digest("board_create", &json!({"title":"B"}));

    let begin = |digest: &str| {
        store
            .external_receipt_begin(
                "client",
                &ReceiptTarget::Project("/work/a".into()),
                "board_create",
                "r",
                digest,
            )
            .unwrap()
    };

    assert_eq!(first, same);
    assert_eq!(begin(&first), BEGIN::Fresh);
    assert_eq!(begin(&first), BEGIN::Pending);
    assert_eq!(begin(&changed), BEGIN::Conflict);
    store
        .external_receipt_finish(
            "client",
            &ReceiptTarget::Project("/work/a".into()),
            "board_create",
            "r",
            &first,
            &Ok(json!({"id":1})),
        )
        .unwrap();
    assert_eq!(begin(&first), BEGIN::Replay(Ok(json!({"id":1}))));
    assert_eq!(
        store
            .external_receipt_begin(
                "other",
                &ReceiptTarget::Project("/work/a".into()),
                "board_create",
                "r",
                &first
            )
            .unwrap(),
        BEGIN::Fresh
    );
}

#[test]
fn the_same_request_id_in_another_project_is_a_separate_mutation() {
    let store = Store::open(std::path::Path::new(":memory:")).unwrap();
    let a = digest("board_create", &json!({"project":"/work/a","title":"A"}));
    let b = digest("board_create", &json!({"project":"/work/b","title":"A"}));
    let begin = |project: &str, digest: &str| {
        store
            .external_receipt_begin(
                "client",
                &ReceiptTarget::Project(project.into()),
                "board_create",
                "r",
                digest,
            )
            .unwrap()
    };

    assert_eq!(begin("/work/a", &a), BEGIN::Fresh);
    assert_eq!(begin("/work/b", &b), BEGIN::Fresh);
    assert_eq!(begin("/work/a", &b), BEGIN::Conflict);
}

#[test]
fn resource_receipt_keys_are_isolated_from_projects_and_each_resource_kind() {
    let key = |target| key_for(&target, "client", "action", "request");
    let keys = [
        key(ReceiptTarget::Project("/id".into())),
        key(ReceiptTarget::Resource {
            kind: RESOURCE::Vault,
            id: "/id".into(),
        }),
        key(ReceiptTarget::Resource {
            kind: RESOURCE::InboxProvider,
            id: "/id".into(),
        }),
        key(ReceiptTarget::Resource {
            kind: RESOURCE::Familiar,
            id: "/id".into(),
        }),
        key(ReceiptTarget::Resource {
            kind: RESOURCE::Familiar,
            id: "/other".into(),
        }),
    ];
    assert_eq!(
        keys.iter().collect::<std::collections::HashSet<_>>().len(),
        keys.len()
    );
}
