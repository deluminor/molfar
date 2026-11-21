use super::*;

#[gpui::test]
fn mcp_operator_provider_uses_the_authenticated_app_bridge(cx: &mut TestAppContext) {
    use molfar_core::{
        agent::AccessMode,
        secrets::{SecretName, SecretStore, SecretValue},
    };
    use std::{
        fs,
        os::unix::fs::PermissionsExt,
        path::Path,
        time::{Duration, Instant},
    };

    let f = fixture();
    let binary = f.root.join("operator-fixture");
    fs::write(&binary, include_str!("provider.py")).unwrap();
    fs::set_permissions(&binary, fs::Permissions::from_mode(0o700)).unwrap();

    let args = json!({"project":f.granted,"prompt":"Verify the app bridge","requestId":"bridge","operator":true});
    let session = reserve_session(&f, &args);
    let _provider = crate::runtime::test_provider::Registration::new(&f.store, session, binary);
    let window = window(&f, cx);
    let (server, calls) = molfar_core::familiar::bridge::Server::start().unwrap();

    window
        .update(cx, |shell, _, cx| {
            cx.set_global(crate::settings::Preferences {
                default_access: Some(AccessMode::Supervised.id().into()),
                ..Default::default()
            });
            let environment = server.environment(session);
            shell.app_bridge = Some(server);
            if let Some(view) = shell.sessions.get(&session) {
                view.update(cx, |view, _| view.set_app_environment(environment));
            }
            shell.secret_store = SecretStore::in_memory();
            let db = locked(&shell.store).unwrap();
            for (path, name) in [(&f.granted, "FIXTURE_KEY"), (&f.other, "OUT_OF_SCOPE")] {
                let scope = shell
                    .secret_store
                    .project_scope(&db, Path::new(path), Some("Fixture"))
                    .unwrap();
                shell
                    .secret_store
                    .create(
                        &db,
                        scope,
                        SecretName::parse(name).unwrap(),
                        SecretValue::from_text("synthetic-operator-value".into()).unwrap(),
                    )
                    .unwrap();
            }
        })
        .unwrap();

    let mut privileged = principal(&f);
    privileged.grants.push(GRANT::SessionsOperator);
    let launch = call(window, &privileged, START, args, cx).unwrap();
    assert_eq!(launch["sessionId"], session);
    assert_eq!(launch["operator"], true);
    let marker = Path::new(&f.granted).join("operator-fixture-result");
    let deadline = Instant::now() + Duration::from_secs(15);
    loop {
        while let Ok(call) = calls.try_recv() {
            window
                .update(cx, |shell, window, cx| {
                    shell.handle_app_call(call, window, cx)
                })
                .unwrap();
        }
        cx.run_until_parked();
        let transcript = locked(&f.store).unwrap().load(session).unwrap();
        let rows = serde_json::to_string(&transcript.rows).unwrap();
        assert!(!rows.contains("synthetic-operator-value"));
        if let Ok(status) = fs::read_to_string(&marker)
            && !status.is_empty()
        {
            assert_eq!(status, "verified");
            break;
        }
        assert!(
            Instant::now() < deadline,
            "provider did not confirm the app calls: {rows}"
        );
        std::thread::sleep(Duration::from_millis(10));
    }
}
