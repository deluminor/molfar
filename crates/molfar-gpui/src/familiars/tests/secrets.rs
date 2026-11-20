use super::*;
use molfar_core::secrets::{Scope, SecretName, SecretValue, request, run};

#[gpui::test]
fn familiar_requests_and_runs_use_its_own_scope(cx: &mut TestAppContext) {
    let fixture = setup(cx);
    let root = std::env::current_dir()
        .unwrap()
        .to_string_lossy()
        .into_owned();
    fixture.manager.update(cx, |manager, _| {
        manager.secret_store = molfar_core::secrets::SecretStore::in_memory();
        manager.roster.get_mut(&fixture.id).unwrap().projects = vec![root.clone()];
        let db = locked(&manager.store).unwrap();
        manager
            .secret_store
            .create(
                &db,
                Scope::Project("fixture".into()),
                SecretName::parse("TOKEN").unwrap(),
                SecretValue::from_text("project-credential-fixture".into()).unwrap(),
            )
            .unwrap();
    });
    let secret_scope = Scope::Familiar(fixture.id.clone());
    let bad_request = call(
        &fixture,
        "foreign",
        request::REQUEST,
        json!({"name":"TOKEN","reason":"Fixture","scope":"project:fixture"}),
        cx,
    );
    assert!(bad_request.try_recv().unwrap().is_err());

    let request = call(
        &fixture,
        "request-token",
        request::REQUEST,
        json!({"name":"TOKEN","reason":"Use the fixture"}),
        cx,
    );
    let retry = call(
        &fixture,
        "request-token",
        request::REQUEST,
        json!({"name":"TOKEN","reason":"Use the fixture"}),
        cx,
    );
    fixture.manager.update(cx, |manager, cx| {
        let card = manager.secret_requests[&fixture.session]
            .card
            .as_ref()
            .unwrap()
            .clone();
        assert_eq!(card.read(cx).request.scope, secret_scope);
        let view = manager.chats[&fixture.id].read(cx);
        assert_eq!(
            view.mobile_waiting(cx),
            Some(crate::conversation::MobileWaiting::Secret)
        );
        card.update(cx, |card, cx| {
            card.enter_value("familiar-credential-fixture".into(), cx)
        });
    });
    cx.run_until_parked();
    assert!(request.try_recv().is_err());
    assert_eq!(
        retry.try_recv().unwrap().unwrap(),
        json!({"status":"saved"})
    );
    let list = call(&fixture, "list", request::LIST, json!({}), cx)
        .try_recv()
        .unwrap()
        .unwrap();
    assert_eq!(list.as_array().unwrap().len(), 1);
    assert_eq!(list[0]["scope"], secret_scope.to_string());

    #[cfg(unix)]
    let argv = ["sh", "-c", "printf %s \"$TOKEN\""];
    #[cfg(windows)]
    let argv = ["cmd.exe", "/D", "/C", "echo %TOKEN%"];
    let input = json!({"argv":argv,"secrets":[{"name":"TOKEN","env":"TOKEN"}]});
    let response = call(&fixture, "run", run::ACTION, input.clone(), cx);
    let deadline = std::time::Instant::now() + Duration::from_secs(10);
    let output = loop {
        cx.run_until_parked();
        match response.try_recv() {
            Ok(reply) => break reply.unwrap(),
            Err(mpsc::TryRecvError::Empty) => {
                assert!(
                    std::time::Instant::now() < deadline,
                    "Familiar app run did not settle"
                );
                std::thread::sleep(Duration::from_millis(20));
            }
            Err(error) => panic!("Familiar app run reply disappeared: {error}"),
        }
    };
    assert_eq!(output["stdout"].as_str().unwrap().trim(), "[secret:TOKEN]");
    let replay = call(&fixture, "run", run::ACTION, input, cx)
        .try_recv()
        .unwrap()
        .unwrap();
    assert_eq!(replay["outputExpired"], true);
    assert_eq!(
        replay["cwd"],
        std::path::Path::new(&root)
            .canonicalize()
            .unwrap()
            .to_string_lossy()
            .as_ref()
    );

    fixture
        .manager
        .update(cx, |manager, cx| manager.remove_familiar(&fixture.id, cx));
    cx.run_until_parked();
    fixture.manager.read_with(cx, |manager, _| {
        let entries = manager
            .secret_store
            .list(&locked(&manager.store).unwrap())
            .unwrap();
        assert_eq!(entries.len(), 1);
        assert_eq!(entries[0].scope, Scope::Project("fixture".into()));
    });
}
