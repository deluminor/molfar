use super::tests::{Fixture, call, fixture, principal, window};
use super::*;
use gpui::TestAppContext;
use molfar_core::store::PROMPT;

fn interrupt(f: &Fixture, tool: &str, arguments: &Value) {
    let project = molfar_core::files::path_key(&f.granted);
    let begin = locked(&f.store)
        .unwrap()
        .external_receipt_begin(
            "client",
            &project,
            tool,
            arguments["requestId"].as_str().unwrap(),
            &receipts::digest(tool, arguments),
        )
        .unwrap();
    assert_eq!(begin, BEGIN::Fresh);
}

/// Moves a reserved prompt into the session queue, then optionally records
/// that its provider accepted it.
fn hand_off(f: &Fixture, session: i64, request: &str, prompt: &str, deliver: bool) {
    let mut store = locked(&f.store).unwrap();
    store.prepare_app_prompt(session, request, prompt).unwrap();
    let mut queue = store.follow_ups(session).unwrap();
    let message = queue.draft.take().unwrap();
    queue.messages.push(message.clone());
    store.save_follow_ups(session, &queue).unwrap();
    if deliver {
        let mut transcript = molfar_core::transcript::Transcript::default();
        transcript.begin("user");
        transcript.append(prompt);
        store
            .write_rows_with_message(session, 0, &transcript.rows, Some(&message.id))
            .unwrap();
    }
}

#[gpui::test]
fn a_replay_needs_the_current_project_grant(cx: &mut TestAppContext) {
    let f = fixture();
    let window = window(&f, cx);
    let granted = principal(&f);
    let mut removed = granted.clone();
    removed.projects = vec![f.other.clone()];
    let input =
        json!({"project":f.granted,"title":"Card","description":"Do it","requestId":"card-1"});

    let card = call(window, &granted, "board_create", input.clone(), cx).unwrap();
    let fresh = call(
        window,
        &removed,
        "board_create",
        json!({"project":f.granted,"title":"Card","description":"Do it","requestId":"card-2"}),
        cx,
    );
    let replay = call(window, &removed, "board_create", input, cx);

    let error = replay.unwrap_err();
    assert_eq!(error, fresh.unwrap_err());
    assert!(!error.contains(card["card"]["id"].as_str().unwrap()));
}

#[gpui::test]
fn one_request_id_creates_one_card_in_each_granted_project(cx: &mut TestAppContext) {
    let f = fixture();
    let window = window(&f, cx);
    let mut both = principal(&f);
    both.projects = vec![f.granted.clone(), f.other.clone()];
    let create = |project: &str| json!({"project":project,"title":"Card","description":"Do it","requestId":"card-1"});

    let first = call(window, &both, "board_create", create(&f.granted), cx).unwrap();
    let second = call(window, &both, "board_create", create(&f.other), cx).unwrap();

    assert_ne!(first["card"]["id"], second["card"]["id"]);
    assert_eq!(second["card"]["project"], json!(f.other));
}

#[gpui::test]
fn an_interrupted_follow_up_resolves_to_its_one_reserved_turn(cx: &mut TestAppContext) {
    let f = fixture();
    let window = window(&f, cx);
    let principal = principal(&f);
    let session = f.sessions.0;

    for (request, deliver) in [("send-queued", false), ("send-delivered", true)] {
        let arguments = json!({"sessionId":session,"prompt":"Continue","requestId":request});
        interrupt(&f, "sessions_send", &arguments);
        hand_off(
            &f,
            session,
            &format!("external:client:{request}"),
            "Continue",
            deliver,
        );
        let queued = locked(&f.store)
            .unwrap()
            .follow_ups(session)
            .unwrap()
            .messages
            .len();

        let result = call(window, &principal, "sessions_send", arguments, cx).unwrap();

        assert_eq!(result, json!({"sessionId":session,"submitted":true}));
        let store = locked(&f.store).unwrap();
        let state = store.follow_ups(session).unwrap();
        assert!(state.draft.is_none(), "{request}");
        assert_eq!(state.messages.len(), queued, "{request}");
    }
}

#[gpui::test]
fn a_follow_up_is_not_sent_while_an_approval_is_pending(cx: &mut TestAppContext) {
    let f = fixture();
    let window = window(&f, cx);
    let principal = principal(&f);
    let session = f.sessions.0;
    window
        .update(cx, |shell, _, cx| {
            let view = shell.ensure_session(session, cx).unwrap();
            view.update(cx, |view, cx| view.load(cx));
        })
        .unwrap();
    cx.run_until_parked();
    window
        .update(cx, |shell, _, cx| {
            shell.sessions[&session].update(cx, |view, _| {
                view.push_test_approval(molfar_core::agent::Approval {
                    id: "approval".into(),
                    title: "Run a command?".into(),
                    detail: "git status".into(),
                    can_remember: false,
                })
            });
        })
        .unwrap();

    let result = call(
        window,
        &principal,
        "sessions_send",
        json!({"sessionId":session,"prompt":"Continue","requestId":"send-1"}),
        cx,
    );

    assert!(result.unwrap_err().contains("nothing was sent"));
    assert_eq!(
        locked(&f.store)
            .unwrap()
            .app_prompt_state(session, "external:client:send-1")
            .unwrap(),
        PROMPT::Missing
    );
}

#[gpui::test]
fn an_interrupted_start_never_relaunches_an_accepted_prompt(cx: &mut TestAppContext) {
    let f = fixture();
    let arguments = json!({"project":f.granted,"prompt":"Review","requestId":"start-1"});
    let digest = receipts::digest("sessions_start", &arguments);
    let (session, _) = locked(&f.store)
        .unwrap()
        .create_app_session("external:client", "start-1", &digest, "codex", &f.granted)
        .unwrap();
    hand_off(&f, session.id, "start-1", "Review", false);
    interrupt(&f, "sessions_start", &arguments);
    let window = window(&f, cx);
    let before = locked(&f.store).unwrap().sessions().unwrap().len();

    let result = call(window, &principal(&f), "sessions_start", arguments, cx).unwrap();

    assert_eq!(result["sessionId"], json!(session.id));
    assert_eq!(result["accepted"], true);
    let store = locked(&f.store).unwrap();
    assert_eq!(store.sessions().unwrap().len(), before);
    let state = store.follow_ups(session.id).unwrap();
    assert!(state.draft.is_none());
    assert_eq!(state.messages.len(), 1);
}

#[gpui::test]
fn deleted_targets_report_pending_receipts_and_replay_finished_results(cx: &mut TestAppContext) {
    use molfar_core::external_mcp::grants::types::{DOMAIN, GRANT};

    let f = fixture();
    let mut principal = principal(&f);
    principal
        .grants
        .extend([GRANT::Write(DOMAIN::Notes), GRANT::Destructive]);

    let input = json!({"project":f.granted,"body":"Delete me","requestId":"create"});
    let note = call(window(&f, cx), &principal, notes_api::CREATE, input, cx).unwrap();
    let note_id = note["note"]["id"].as_str().unwrap();
    let session = f.sessions.0;
    let cases = [
        (
            tools::sessions::DELETE,
            json!({"sessionId":session,"requestId":"delete"}),
            json!({"sessionId":session,"deleted":true}),
        ),
        (
            notes_api::DELETE,
            json!({"id":note_id,"requestId":"delete"}),
            json!({"id":note_id,"deleted":true}),
        ),
    ];
    for (tool, arguments, _) in &cases {
        interrupt(&f, tool, arguments);
    }
    {
        let mut store = locked(&f.store).unwrap();
        store.delete(session).unwrap();
        store.delete_note(note_id).unwrap();
    }

    let reopened = window(&f, cx);
    let mut revoked = principal.clone();
    revoked.projects = vec![f.other.clone()];
    for (tool, arguments, expected) in cases {
        let denied = call(reopened, &revoked, tool, arguments.clone(), cx).unwrap_err();
        assert!(!denied.contains("pending"));
        assert_eq!(
            call(reopened, &principal, tool, arguments.clone(), cx).unwrap_err(),
            "Deletion outcome is pending for this requestId."
        );

        locked(&f.store)
            .unwrap()
            .external_receipt_finish(
                &principal.client_id,
                &f.granted,
                tool,
                arguments["requestId"].as_str().unwrap(),
                &receipts::digest(tool, &arguments),
                &Ok(expected.clone()),
            )
            .unwrap();
        assert_eq!(
            call(reopened, &principal, tool, arguments, cx).unwrap(),
            expected
        );
    }
}
