use super::*;

#[gpui::test]
fn managing_sessions_is_project_scoped_and_deletion_requires_the_flag(cx: &mut TestAppContext) {
    let f = fixture();
    let window = window(&f, cx);
    let mut principal = principal(&f);
    let (id, other) = f.sessions;

    let rename = |id| json!({"sessionId":id,"title":"  Renamed  ","requestId":"rename"});
    assert_eq!(
        call(window, &principal, "sessions_update", rename(other), cx).unwrap_err(),
        "Session not found."
    );
    call(window, &principal, "sessions_update", rename(id), cx).unwrap();
    let summary = || {
        locked(&f.store)
            .unwrap()
            .sessions()
            .unwrap()
            .into_iter()
            .find(|session| session.id == id)
    };
    assert_eq!(summary().unwrap().title, "Renamed");

    window
        .update(cx, |shell, window, cx| {
            shell.open(id, window, cx);
        })
        .unwrap();
    cx.run_until_parked();
    for (tool, request, archived) in [
        ("sessions_archive", "archive", true),
        ("sessions_archive", "again", true),
        ("sessions_unarchive", "restore", false),
    ] {
        call(
            window,
            &principal,
            tool,
            json!({"sessionId":id,"requestId":request}),
            cx,
        )
        .unwrap();
        assert_eq!(summary().unwrap().archived, archived);
        assert!(
            window
                .update(cx, |shell, _, _| shell.workspace.tab_of(id).is_none())
                .unwrap()
        );
    }

    let args = json!({"sessionId":id,"requestId":"delete"});
    assert!(
        !tools::visible(&principal)
            .iter()
            .any(|tool| tool.name == "sessions_delete")
    );
    assert!(
        call(window, &principal, "sessions_delete", args.clone(), cx)
            .unwrap_err()
            .contains("lacks permission")
    );
    assert!(summary().is_some());
    principal.grants.push(GRANT::Destructive);
    let result = call(window, &principal, "sessions_delete", args.clone(), cx).unwrap();
    assert!(summary().is_none());
    assert_eq!(
        result,
        call(window, &principal, "sessions_delete", args.clone(), cx).unwrap()
    );
    principal.projects = vec![f.other.clone()];
    assert_eq!(
        call(window, &principal, "sessions_delete", args, cx).unwrap_err(),
        "Session not found."
    );
}
