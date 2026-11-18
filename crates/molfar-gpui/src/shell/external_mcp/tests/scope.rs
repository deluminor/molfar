use super::*;

#[gpui::test]
fn grants_reach_only_registered_granted_projects_and_their_sessions(cx: &mut TestAppContext) {
    let f = fixture();
    let window = window(&f, cx);
    let principal = principal(&f);

    let projects = call(window, &principal, "projects_list", json!({}), cx).unwrap();
    let listed = call(
        window,
        &principal,
        "sessions_list",
        json!({"project":f.granted}),
        cx,
    )
    .unwrap();
    let foreign = call(
        window,
        &principal,
        "sessions_list",
        json!({"project":f.other}),
        cx,
    );
    let hidden = call(
        window,
        &principal,
        "sessions_read",
        json!({"sessionId":f.sessions.1}),
        cx,
    );
    let missing = call(
        window,
        &principal,
        "sessions_read",
        json!({"sessionId":999_999}),
        cx,
    );
    let read = call(
        window,
        &principal,
        "sessions_read",
        json!({"sessionId":f.sessions.0}),
        cx,
    )
    .unwrap();
    let stop = call(
        window,
        &principal,
        "sessions_stop",
        json!({"sessionId":f.sessions.0,"requestId":"stop-1"}),
        cx,
    )
    .unwrap();

    assert_eq!(projects["projects"].as_array().unwrap().len(), 1);
    assert_eq!(projects["projects"][0]["project"], json!(f.granted));
    assert_eq!(listed["sessions"][0]["sessionId"], json!(f.sessions.0));
    assert_eq!(listed["sessions"].as_array().unwrap().len(), 1);
    assert!(foreign.is_err());
    assert_eq!(hidden.unwrap_err(), missing.unwrap_err());
    assert_eq!(read["status"], "idle");
    assert_eq!(stop["alreadyIdle"], true);
}

#[gpui::test]
fn session_start_outside_the_grant_reserves_nothing(cx: &mut TestAppContext) {
    let f = fixture();
    let window = window(&f, cx);
    let principal = principal(&f);
    let before = locked(&f.store).unwrap().sessions().unwrap().len();

    let foreign = call(
        window,
        &principal,
        "sessions_start",
        json!({"project":f.other,"prompt":"Review","requestId":"start-1"}),
        cx,
    );
    let operator = call(
        window,
        &principal,
        "sessions_start",
        json!({"project":f.granted,"prompt":"/operator take over","requestId":"start-2"}),
        cx,
    );

    assert!(foreign.is_err());
    assert!(operator.is_err());
    assert_eq!(locked(&f.store).unwrap().sessions().unwrap().len(), before);
}
