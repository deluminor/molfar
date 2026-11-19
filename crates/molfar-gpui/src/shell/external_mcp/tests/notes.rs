use super::*;
use molfar_core::notes::NoteUpsert;

#[gpui::test]
fn notes_are_scoped_paged_replayable_and_audited_without_content(cx: &mut TestAppContext) {
    let f = fixture();
    let window = window(&f, cx);
    let mut principal = principal(&f);
    principal
        .grants
        .extend([GRANT::Read(DOMAIN::Notes), GRANT::Write(DOMAIN::Notes)]);
    for (id, cwd) in [("legacy", None), ("foreign", Some(f.other.clone()))] {
        locked(&f.store)
            .unwrap()
            .upsert_note(&NoteUpsert {
                id: id.into(),
                title: id.into(),
                body: "body".into(),
                tags: vec![],
                source_session_id: None,
                source_cwd: cwd,
                finalize_slug: true,
            })
            .unwrap();
        assert!(call(window, &principal, "notes_read", json!({"id":id}), cx).is_err());
    }
    let input = json!({
        "project":f.granted,"title":"Private title","body":"αβγδ",
        "tags":["private-tag"],"requestId":"create"
    });
    let created = call(window, &principal, "notes_create", input.clone(), cx).unwrap();
    assert_eq!(
        call(window, &principal, "notes_create", input, cx).unwrap(),
        created
    );
    let id = &created["note"]["id"];
    let list = call(window, &principal, "notes_list", json!({"limit":1}), cx).unwrap();
    assert_eq!(list["total"], 1);
    assert_eq!(&list["notes"][0]["id"], id);
    assert_eq!(
        call(window, &principal, "notes_list", json!({"offset":1}), cx).unwrap()["notes"],
        json!([])
    );

    let first = call(
        window,
        &principal,
        "notes_read",
        json!({"id":id,"maxChars":2}),
        cx,
    )
    .unwrap();
    assert_eq!(first["note"]["body"], "αβ");
    let second = call(
        window,
        &principal,
        "notes_read",
        json!({"id":id,"charOffset":first["nextCharOffset"]}),
        cx,
    )
    .unwrap();
    assert_eq!(second["note"]["body"], "γδ");
    let update = json!({"id":id,"body":"Private update","requestId":"write"});
    call(window, &principal, "notes_write", update, cx).unwrap();
    assert_eq!(
        call(window, &principal, "notes_read", json!({"id":id}), cx).unwrap()["note"]["body"],
        "Private update"
    );

    let delete = json!({"id":id,"requestId":"delete"});
    assert!(
        !tools::visible(&principal)
            .iter()
            .any(|tool| tool.name == "notes_delete")
    );
    assert!(
        call(window, &principal, "notes_delete", delete.clone(), cx)
            .unwrap_err()
            .contains("lacks permission")
    );
    principal.grants.push(GRANT::Destructive);
    let removed = call(window, &principal, "notes_delete", delete.clone(), cx).unwrap();
    assert_eq!(removed["deleted"], true);
    assert_eq!(
        call(window, &principal, "notes_delete", delete, cx).unwrap(),
        removed
    );
    assert!(call(window, &principal, "notes_read", json!({"id":id}), cx).is_err());

    let audit = locked(&f.store).unwrap().external_audit_log().unwrap();
    assert!(
        audit
            .iter()
            .any(|entry| entry.action == "notes_write" && entry.target.as_deref() == id.as_str())
    );
    assert!(
        audit
            .iter()
            .any(|entry| entry.action == "notes_delete" && entry.outcome == "denied")
    );
    let audit = serde_json::to_string(&audit).unwrap();
    for content in ["Private title", "αβγδ", "private-tag", "Private update"] {
        assert!(!audit.contains(content));
    }
}
