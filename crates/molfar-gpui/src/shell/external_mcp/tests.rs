use super::*;
use gpui::{TestAppContext, WindowHandle};
use molfar_core::{
    external_mcp::{
        grants::types::{DOMAIN, GRANT},
        transport::reply_channel,
    },
    store::Store,
};
use std::{
    process::Command,
    sync::{Arc, Mutex},
};

pub(super) struct Fixture {
    pub(super) root: std::path::PathBuf,
    pub(super) granted: String,
    pub(super) other: String,
    pub(super) store: Database,
    pub(super) sessions: (i64, i64),
}

impl Drop for Fixture {
    fn drop(&mut self) {
        let _ = std::fs::remove_dir_all(&self.root);
    }
}

fn project(path: &std::path::Path) -> String {
    std::fs::create_dir_all(path).unwrap();
    for args in [
        &["init", "-q"][..],
        &[
            "-c",
            "user.name=Fixture",
            "-c",
            "user.email=fixture@example.test",
            "-c",
            "commit.gpgsign=false",
            "commit",
            "--allow-empty",
            "-qm",
            "fixture",
        ],
    ] {
        assert!(
            Command::new("git")
                .current_dir(path)
                .args(args)
                .status()
                .unwrap()
                .success()
        );
    }
    path.to_str().unwrap().to_owned()
}

pub(super) fn fixture() -> Fixture {
    let root = std::env::temp_dir().join(format!(
        "molfar-external-{}",
        molfar_core::familiar::new_id()
    ));
    let granted = project(&root.join("granted"));
    let other = project(&root.join("other"));
    let store = Store::open_desktop(&root.join("molfar.db")).unwrap();
    let mine = store.create("codex", &granted).unwrap().id;
    let theirs = store.create("codex", &other).unwrap().id;
    Fixture {
        root,
        granted,
        other,
        store: Arc::new(Mutex::new(store)),
        sessions: (mine, theirs),
    }
}

pub(super) fn window(f: &Fixture, cx: &mut TestAppContext) -> WindowHandle<Shell> {
    let store = f.store.clone();
    let summaries = locked(&store).unwrap().sessions().unwrap();
    let mut state = crate::workspace::Workspace::default();
    state.add_project(&f.granted);
    state.add_project(&f.other);
    let saved = serde_json::to_string(&state).unwrap();
    let cwd = f.granted.clone();
    let window = cx.update(|cx| {
        cx.open_window(Default::default(), |_, cx| {
            cx.new(|cx| Shell::new(store, summaries, cwd, Some(saved), cx))
        })
        .unwrap()
    });
    cx.run_until_parked();
    window
}

pub(super) fn principal(f: &Fixture) -> Principal {
    Principal {
        client_id: "client".into(),
        name: "OpenBot".into(),
        grants: vec![
            GRANT::Read(DOMAIN::Board),
            GRANT::Write(DOMAIN::Board),
            GRANT::BoardCreate,
            GRANT::Read(DOMAIN::Sessions),
            GRANT::Write(DOMAIN::Sessions),
            GRANT::SessionsStop,
        ],
        resources: vec![],
        projects: vec![f.granted.clone(), "/not/registered".into()],
    }
}

pub(super) fn call(
    window: WindowHandle<Shell>,
    principal: &Principal,
    tool: &'static str,
    arguments: Value,
    cx: &mut TestAppContext,
) -> Result<Value, String> {
    let (reply, mut result) = reply_channel();
    let call = Call {
        principal: principal.clone(),
        tool,
        arguments,
        reply,
    };
    window
        .update(cx, |shell, _, cx| shell.handle_external_call(call, cx))
        .unwrap();
    cx.run_until_parked();
    result.try_recv().expect("the external call must settle")
}

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
fn board_creation_is_idle_deduplicated_and_replayed_after_restart(cx: &mut TestAppContext) {
    let f = fixture();
    let principal = principal(&f);
    let input = json!({"project":f.granted,"title":"From OpenBot","description":"Plan it","requestId":"card-1"});

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

#[gpui::test]
fn settings_create_scope_and_revoke_clients(cx: &mut TestAppContext) {
    let f = fixture();
    let window = window(&f, cx);

    let (status, token) = window
        .update(cx, |shell, window, cx| {
            shell.external_create_client(Some("Laptop"), cx).unwrap();
            let status = shell.external_settings_status();
            let token = status.new_key.clone().unwrap().1;
            let id = status.clients[0].id.clone();
            shell.external_toggle_grant(&id, Some(GRANT::BoardCreate), Some(f.granted.clone()), cx);
            shell.external_rename(&id, "Renamed laptop", cx).unwrap();
            assert!(
                shell
                    .external_create_client(Some("RENAMED LAPTOP"), cx)
                    .is_err()
            );
            assert_eq!(
                shell.external_settings_status().new_key.as_ref().unwrap().0,
                "Renamed laptop"
            );
            shell.close_settings(window, cx);
            (shell.external_settings_status(), token)
        })
        .unwrap();

    assert!(!status.enabled);
    assert!(status.new_key.is_none());
    assert_eq!(status.clients[0].grants, [GRANT::BoardCreate]);
    assert_eq!(status.clients[0].projects, std::slice::from_ref(&f.granted));
    let principal = locked(&f.store)
        .unwrap()
        .external_authenticate(&token)
        .unwrap()
        .unwrap();
    assert!(principal.grants.contains(&GRANT::BoardCreate));
    let reopened = Store::open_desktop(&f.root.join("molfar.db")).unwrap();
    assert_eq!(
        reopened
            .external_authenticate(&token)
            .unwrap()
            .unwrap()
            .name,
        "Renamed laptop"
    );

    window
        .update(cx, |shell, _, cx| {
            shell.external_revoke(&status.clients[0].id, cx)
        })
        .unwrap();
    assert!(
        locked(&f.store)
            .unwrap()
            .external_authenticate(&token)
            .unwrap()
            .is_none()
    );
    let status = window
        .update(cx, |shell, _, _| shell.external_settings_status())
        .unwrap();
    assert!(status.clients.is_empty());
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
