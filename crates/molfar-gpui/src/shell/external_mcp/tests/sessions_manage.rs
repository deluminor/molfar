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
            shell.sessions[&id].update(cx, |view, _| view.busy = true);
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

    window
        .update(cx, |shell, _, cx| {
            assert!(shell.sessions[&id].read(cx).notification_was_cancelled());
        })
        .unwrap();

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

#[gpui::test]
fn deleting_the_last_empty_tab_does_not_reopen_the_target(cx: &mut TestAppContext) {
    let f = fixture();
    let window = window(&f, cx);
    let mut principal = principal(&f);
    principal.grants.push(GRANT::Destructive);
    let id = f.sessions.0;
    window
        .update(cx, |shell, window, cx| {
            shell.open(id, window, cx);
            assert_eq!(shell.workspace.open_sessions(), vec![id]);
        })
        .unwrap();
    cx.run_until_parked();

    call(
        window,
        &principal,
        "sessions_delete",
        json!({"sessionId":id,"requestId":"delete-last"}),
        cx,
    )
    .unwrap();

    assert!(
        locked(&f.store)
            .unwrap()
            .sessions()
            .unwrap()
            .iter()
            .all(|session| session.id != id)
    );
    assert!(
        window
            .update(cx, |shell, _, _| shell.workspace.tab_of(id).is_none())
            .unwrap()
    );
}

#[gpui::test]
fn failed_session_renames_keep_the_saved_title_and_can_retry(cx: &mut TestAppContext) {
    let f = fixture();
    let window = window(&f, cx);
    let principal = principal(&f);
    let id = f.sessions.0;
    let db = rusqlite::Connection::open(f.root.join("molfar.db")).unwrap();
    let saved_title = || {
        locked(&f.store)
            .unwrap()
            .sessions()
            .unwrap()
            .into_iter()
            .find(|session| session.id == id)
            .unwrap()
            .title
    };
    let original = saved_title();
    db.execute_batch(
        "CREATE TRIGGER reject_title BEFORE UPDATE OF title ON sessions
         BEGIN SELECT RAISE(ABORT, 'title write failed'); END;",
    )
    .unwrap();
    let rename = |request, cx: &mut TestAppContext| {
        call(
            window,
            &principal,
            "sessions_update",
            json!({"sessionId":id,"title":"Renamed","requestId":request}),
            cx,
        )
    };

    let first = rename("first", cx);
    let second = rename("second", cx);
    for result in [first, second] {
        assert!(result.unwrap_err().contains("title write failed"));
    }
    window
        .update(cx, |shell, _, cx| {
            assert_eq!(shell.session_metadata(id, cx).summary.title, original);
        })
        .unwrap();
    assert_eq!(saved_title(), original);

    db.execute_batch("DROP TRIGGER reject_title;").unwrap();
    rename("retry", cx).unwrap();
    assert_eq!(saved_title(), "Renamed");
}
