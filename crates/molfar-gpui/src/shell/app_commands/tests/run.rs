use super::*;
use molfar_core::secrets::{Scope, SecretName, SecretStore, SecretValue};

const NAME: &str = "API_KEY";
const VALUE: &str = "fixture-credential-479";

#[gpui::test]
fn run_receipt_metadata_only(cx: &mut TestAppContext) {
    let (window, _, caller) = setup(cx);
    let root = std::env::current_dir().unwrap();
    window
        .update(cx, |shell, _, cx| {
            shell.sessions[&caller].update(cx, |view, _| {
                view.settings.worktree_cwd = Some(root.to_string_lossy().into_owned());
            });
            shell.secret_store = SecretStore::in_memory();
            let db = locked(&shell.store).unwrap();
            shell
                .secret_store
                .create(
                    &db,
                    Scope::Global,
                    SecretName::parse(NAME).unwrap(),
                    SecretValue::from_text(VALUE.into()).unwrap(),
                )
                .unwrap();
        })
        .unwrap();

    #[cfg(unix)]
    let argv = ["sh", "-c", "printf %s \"$API_KEY\""];
    #[cfg(windows)]
    let argv = ["cmd.exe", "/D", "/C", "echo %API_KEY%"];
    let input = json!({"argv":argv,"secrets":[{"name":NAME,"env":NAME}]});
    let (reply, result) = mpsc::channel();
    window
        .update(cx, |shell, window, cx| {
            shell.handle_app_call(
                Call {
                    session: caller,
                    request_id: "run-token".into(),
                    action: "run".into(),
                    input: input.clone(),
                    reply,
                },
                window,
                cx,
            );
        })
        .unwrap();
    let deadline = std::time::Instant::now() + std::time::Duration::from_secs(10);
    let output = loop {
        assert!(
            std::time::Instant::now() < deadline,
            "app run did not settle"
        );
        cx.run_until_parked();
        match result.try_recv() {
            Ok(result) => break result.unwrap(),
            Err(mpsc::TryRecvError::Empty) => {
                std::thread::sleep(std::time::Duration::from_millis(20))
            }
            Err(error) => panic!("app run reply disappeared: {error}"),
        }
    };
    assert_eq!(
        output["stdout"].as_str().unwrap().trim(),
        "[secret:API_KEY]"
    );
    let replay = call(window, caller, "run-token", "run", input, cx).unwrap();
    assert_eq!(replay["outputExpired"], true);
    assert!(replay.get("stdout").is_none());
    window
        .update(cx, |shell, _, _| {
            let db = locked(&shell.store).unwrap();
            let raw = db
                .setting(&app::receipt_key(caller, "run-token"))
                .unwrap()
                .unwrap();
            for forbidden in ["stdout", "stderr", VALUE] {
                assert!(!raw.contains(forbidden));
            }
        })
        .unwrap();
}
