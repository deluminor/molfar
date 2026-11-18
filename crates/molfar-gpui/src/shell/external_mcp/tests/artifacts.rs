use super::*;

#[gpui::test]
fn artifacts_list_and_read_only_registered_versions_in_scope(cx: &mut TestAppContext) {
    let f = fixture();
    let window = window(&f, cx);
    let principal = principal(&f);
    let card = call(
        window,
        &principal,
        "board_create",
        json!({
            "project": f.granted, "title": "Fixture", "description": "αλβ", "requestId": "create"
        }),
        cx,
    )
    .unwrap();
    let id = &card["card"]["id"];
    let list = call(
        window,
        &principal,
        "board_artifacts_list",
        json!({"cardId":id}),
        cx,
    )
    .unwrap();
    assert_eq!(list["artifacts"][0]["version"], 1);
    assert_eq!(list["artifacts"][0]["kind"], "task");
    let page = |kind, version, max, offset| {
        json!({
            "cardId":id,"kind":kind,"version":version,"maxChars":max,"charOffset":offset
        })
    };
    let first = call(
        window,
        &principal,
        "board_artifacts_read",
        page("task", 1, 3, 0),
        cx,
    )
    .unwrap();
    assert_eq!(first["body"].as_str().unwrap().chars().count(), 3);
    assert_eq!(first["nextCharOffset"], 3);
    let second = call(
        window,
        &principal,
        "board_artifacts_read",
        page("task", 1, 5, 3),
        cx,
    )
    .unwrap();
    assert_eq!(second["nextCharOffset"], 8);
    for args in [
        page("../task", 1, 3, 0),
        page("task", 9, 3, 0),
        page("task", 1, 6001, 0),
    ] {
        assert!(call(window, &principal, "board_artifacts_read", args, cx).is_err());
    }

    let mut other = principal.clone();
    other.projects = vec![f.other.clone()];
    for (tool, args) in [
        ("board_artifacts_list", json!({"cardId":id})),
        ("board_artifacts_read", page("task", 1, 3, 0)),
    ] {
        assert_eq!(
            call(window, &other, tool, args, cx).unwrap_err(),
            "Board card not found."
        );
    }
}
