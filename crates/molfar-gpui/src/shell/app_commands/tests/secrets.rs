use super::*;
use molfar_core::secrets::{Scope, SecretName, SecretStore, SecretValue, Status, request};

const NAME: &str = "API_KEY";
const VALUE: &str = "fictional-credential";

fn fixture(cx: &mut TestAppContext) -> (WindowHandle<Shell>, i64) {
    let (window, _, caller) = setup(cx);
    window
        .update(cx, |shell, _, _| {
            shell.secret_store = SecretStore::in_memory();
        })
        .unwrap();
    (window, caller)
}

fn request(
    window: WindowHandle<Shell>,
    caller: i64,
    request_id: &str,
    cx: &mut TestAppContext,
) -> mpsc::Receiver<Result<Value, String>> {
    let (reply, result) = mpsc::channel();
    window
        .update(cx, |shell, window, cx| {
            shell.handle_app_call(
                Call {
                    session: caller,
                    request_id: request_id.into(),
                    action: request::REQUEST.into(),
                    input: json!({"name": NAME, "reason":"Call the test API"}),
                    reply,
                },
                window,
                cx,
            )
        })
        .unwrap();
    cx.run_until_parked();
    result
}

#[gpui::test]
fn secret_request_save_returns_saved_and_list_returns_metadata(cx: &mut TestAppContext) {
    let (window, caller) = fixture(cx);
    let reply = request(window, caller, "save", cx);
    let card = window
        .update(cx, |shell, _, cx| {
            let companion = shell.companion_test_transcript(caller, cx).unwrap();
            assert_eq!(companion["status"], "needs-you");
            assert!(companion["blocks"].as_array().unwrap().iter().any(|block| {
                block["role"] == "system"
                    && block["text"] == "Secret request API_KEY — answer on desktop"
            }));
            let card = shell.open_secret_requests[&caller].card.clone().unwrap();
            assert_eq!(card.read(cx).request.name.as_str(), NAME);
            assert_eq!(
                shell.sessions[&caller].read(cx).mobile_waiting(cx),
                Some(crate::conversation::MobileWaiting::Secret)
            );
            card.update(cx, |card, cx| card.enter_value(VALUE.into(), cx));
            card
        })
        .unwrap();
    cx.run_until_parked();
    assert_eq!(
        reply.try_recv().unwrap().unwrap(),
        json!({"status":"saved"})
    );
    window
        .update(cx, |shell, _, cx| {
            assert!(card.read(cx).input_is_empty(cx));
            let db = locked(&shell.store).unwrap();
            let history = request::SecretRequest::history(&db, caller).unwrap();
            assert_eq!(history[0].status, request::RequestStatus::Saved);
            assert!(!serde_json::to_string(&history).unwrap().contains(VALUE));
            let receipt = db
                .setting(&app::receipt_key(caller, "save"))
                .unwrap()
                .unwrap();
            assert!(!receipt.contains(VALUE));
        })
        .unwrap();

    let list = call(window, caller, "list", request::LIST, json!({}), cx).unwrap();
    assert_eq!(list[0]["name"], NAME);
    assert_eq!(list[0].as_object().unwrap().len(), 3);
    assert!(!list.to_string().contains(VALUE));
    assert_eq!(
        request(window, caller, "duplicate", cx)
            .try_recv()
            .unwrap()
            .unwrap(),
        json!({"status":"exists"})
    );
}

#[gpui::test]
fn separate_id_is_rejected_retry_reattaches_and_stop_cancels(cx: &mut TestAppContext) {
    let (window, caller) = fixture(cx);
    window
        .update(cx, |shell, _, cx| {
            shell.sessions[&caller].update(cx, |view, _| view.busy = true)
        })
        .unwrap();
    let _first = request(window, caller, "waiting", cx);
    let second = request(window, caller, "second", cx)
        .try_recv()
        .unwrap()
        .unwrap_err();
    assert!(second.contains("open secret request"));
    let retry = request(window, caller, "waiting", cx);
    window
        .update(cx, |shell, _, cx| {
            shell.sessions[&caller].update(cx, |view, cx| view.stop_if_busy(cx))
        })
        .unwrap();
    cx.run_until_parked();
    assert_eq!(
        retry.try_recv().unwrap().unwrap(),
        json!({"status":"cancelled"})
    );
}

#[gpui::test]
fn settings_create_wins_over_open_chat_request(cx: &mut TestAppContext) {
    let (window, caller) = fixture(cx);
    let reply = request(window, caller, "race", cx);
    window
        .update(cx, |shell, _, cx| {
            let card = shell.open_secret_requests[&caller].card.clone().unwrap();
            let scope = card.read(cx).request.scope.clone();
            assert_ne!(scope, Scope::Global);
            let db = locked(&shell.store).unwrap();
            assert_eq!(
                shell.secret_store.create(
                    &db,
                    scope.clone(),
                    SecretName::parse(NAME).unwrap(),
                    SecretValue::from_text(VALUE.into()).unwrap()
                ),
                Ok(Status::Saved)
            );
            drop(db);
            card.update(cx, |card, cx| {
                card.enter_value("another-credential".into(), cx)
            });
        })
        .unwrap();
    cx.run_until_parked();
    assert_eq!(
        reply.try_recv().unwrap().unwrap(),
        json!({"status":"exists"})
    );
}

#[gpui::test]
fn read_only_can_list_and_cannot_request(cx: &mut TestAppContext) {
    let (window, caller) = fixture(cx);
    window
        .update(cx, |shell, _, cx| {
            shell.sessions[&caller].update(cx, |view, _| view.app_read_only = true);
        })
        .unwrap();
    assert_eq!(
        call(window, caller, "list", request::LIST, json!({}), cx).unwrap(),
        json!([])
    );
    let error = request(window, caller, "denied", cx)
        .try_recv()
        .unwrap()
        .unwrap_err();
    assert!(error.contains("read-only"));
}

#[gpui::test]
fn failed_secret_request_save_can_retry_without_retyping(cx: &mut TestAppContext) {
    let (window, caller) = fixture(cx);
    let reply = request(window, caller, "retry-save", cx);
    let card = window
        .update(cx, |shell, _, cx| {
            locked(&shell.store)
                .unwrap()
                .save_setting("secrets.index", "{")
                .unwrap();
            let card = shell.open_secret_requests[&caller].card.clone().unwrap();
            card.update(cx, |card, cx| card.enter_value(VALUE.into(), cx));
            card
        })
        .unwrap();
    cx.run_until_parked();
    assert!(matches!(reply.try_recv(), Err(mpsc::TryRecvError::Empty)));

    window
        .update(cx, |shell, _, cx| {
            let form = card.read(cx);
            assert!(
                !form.input_is_empty(cx),
                "failed save must preserve typed input"
            );
            assert_eq!(
                form.error.as_deref(),
                Some("Could not read or update secret metadata.")
            );
            assert!(!form.error.as_deref().unwrap().contains(VALUE));
            locked(&shell.store)
                .unwrap()
                .save_setting("secrets.index", "[]")
                .unwrap();
            card.update(cx, |_, cx| {
                cx.emit(crate::conversation::secret_request::Answer::Save)
            });
        })
        .unwrap();
    cx.run_until_parked();
    assert_eq!(
        reply.try_recv().unwrap().unwrap(),
        json!({"status":"saved"})
    );

    window
        .update(cx, |shell, _, cx| {
            assert!(card.read(cx).input_is_empty(cx));
            let db = locked(&shell.store).unwrap();
            let scope = card.read(cx).request.scope.clone();
            let redactor = shell.secret_store.redactor(&db, Some(scope)).unwrap();
            assert_eq!(redactor.text(VALUE), "[secret:API_KEY]");
        })
        .unwrap();
}
