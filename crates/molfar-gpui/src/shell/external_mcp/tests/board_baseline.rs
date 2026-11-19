use super::*;

#[gpui::test]
fn board_creation_is_idle_deduplicated_and_replayed_after_restart(cx: &mut TestAppContext) {
    let f = fixture();
    let principal = principal(&f);
    let input = json!({"project":f.granted,"title":"From External client","description":"Plan it","requestId":"card-1"});

    let first_window = window(&f, cx);
    let card = call(first_window, &principal, "board_create", input.clone(), cx).unwrap();
    let changed = call(
        first_window,
        &principal,
        "board_create",
        json!({"project":f.granted,"title":"Other","description":"Plan it","requestId":"card-1"}),
        cx,
    );
    let restarted = window(&f, cx);
    let replay = call(restarted, &principal, "board_create", input, cx).unwrap();
    let foreign = call(
        restarted,
        &principal,
        "board_create",
        json!({"project":f.other,"title":"x","description":"x","requestId":"card-2"}),
        cx,
    );

    assert_eq!(card, replay);
    assert!(changed.unwrap_err().contains("different input"));
    assert!(foreign.is_err());
    let id = card["card"]["id"].as_str().unwrap();
    let read = call(
        restarted,
        &principal,
        "board_read",
        json!({"cardId":id}),
        cx,
    )
    .unwrap();
    assert_eq!(read["card"]["column"], "backlog");
    assert_eq!(read["runs"], json!([]));
    let store = locked(&f.store).unwrap();
    assert_eq!(
        store.board_snapshot(None, false, None).unwrap().cards.len(),
        1
    );
    let audit = store.external_audit_log().unwrap();
    assert!(
        audit
            .iter()
            .any(|entry| entry.action == "board_create" && entry.target.as_deref() == Some(id))
    );
    assert!(!serde_json::to_string(&audit).unwrap().contains("Plan it"));
}

#[gpui::test]
fn board_update_archive_unarchive_respect_eligibility_and_receipts(cx: &mut TestAppContext) {
    use molfar_core::task_board::stage::lifecycle::types::StageAction;

    let f = fixture();
    let window = window(&f, cx);
    let principal = principal(&f);
    let created = call(
        window,
        &principal,
        "board_create",
        json!({
            "project":f.granted, "title":"Before", "description":"Body", "requestId":"new"
        }),
        cx,
    )
    .unwrap();
    let id = created["card"]["id"].as_str().unwrap();
    let edit =
        json!({"cardId":id, "title":"Edited", "acceptanceCriteria":"Verify", "requestId":"edit"});
    let updated = call(window, &principal, "board_update", edit.clone(), cx).unwrap();
    assert_eq!(updated["card"]["title"], "Edited");
    assert_eq!(updated["card"]["acceptanceCriteria"], "Verify");
    assert_eq!(
        call(window, &principal, "board_update", edit.clone(), cx).unwrap(),
        updated
    );
    let conflict = call(
        window,
        &principal,
        "board_update",
        json!({
            "cardId":id, "title":"Changed", "requestId":"edit"
        }),
        cx,
    );
    assert!(conflict.unwrap_err().contains("different input"));

    let mut read_only = principal.clone();
    read_only
        .grants
        .retain(|grant| *grant != GRANT::Write(DOMAIN::Board));
    assert!(
        call(window, &read_only, "board_update", edit, cx)
            .unwrap_err()
            .contains("lacks permission")
    );
    assert!(
        call(
            window,
            &principal,
            "board_archive",
            json!({"cardId":id}),
            cx
        )
        .is_err()
    );
    for (tool, archived) in [("board_archive", true), ("board_unarchive", false)] {
        let args = json!({"cardId":id, "requestId":"archive-state"});
        let first = call(window, &principal, tool, args.clone(), cx).unwrap();
        assert_eq!(first["card"]["archived"], archived);
        assert_eq!(call(window, &principal, tool, args, cx).unwrap(), first);
    }

    let mut other_principal = principal.clone();
    other_principal.projects = vec![f.other.clone()];
    for tool in ["board_archive", "board_unarchive", "board_update"] {
        let args = |card| {
            let mut args = json!({"cardId":card, "requestId":"outside"});
            if tool == "board_update" {
                args["title"] = json!("Denied");
            }
            args
        };
        let foreign = call(window, &other_principal, tool, args(id), cx).unwrap_err();
        let missing = call(window, &principal, tool, args("missing"), cx).unwrap_err();
        assert_eq!(foreign, missing);
    }
    let read = call(window, &principal, "board_read", json!({"cardId":id}), cx).unwrap();
    assert_eq!(
        read["allowedActions"],
        json!(["start", "archive", "editTask"])
    );
    assert_eq!(read["card"]["title"], "Edited");

    let queued = {
        let mut store = locked(&f.store).unwrap();
        let card = store
            .board_scoped_card(id, std::slice::from_ref(&f.granted))
            .unwrap();
        store
            .board_stage_action(id, card.updated_at, StageAction::Start)
            .unwrap()
            .card
    };
    for tool in ["board_archive", "board_unarchive", "board_update"] {
        let mut args = json!({"cardId":id, "requestId":"queued"});
        if tool == "board_update" {
            args["title"] = json!("Denied");
        }
        assert!(call(window, &principal, tool, args, cx).is_err());
    }
    let store = locked(&f.store).unwrap();
    assert_eq!(
        store
            .board_scoped_card(id, std::slice::from_ref(&f.granted))
            .unwrap(),
        queued
    );
    assert!(
        store
            .external_audit_log()
            .unwrap()
            .iter()
            .any(|entry| entry.action == "board_update" && entry.outcome == "denied")
    );
}
