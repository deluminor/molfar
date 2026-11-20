use super::*;

#[test]
fn familiar_scope_is_isolated_and_deletable() {
    let db = Store::open(Path::new(":memory:")).unwrap();
    let store = SecretStore::new(MemoryBackend::default());
    let familiar = Scope::Familiar("id".into());
    let project = Scope::Project("id".into());
    for (scope, value) in [
        (familiar.clone(), "familiar-fixture"),
        (project.clone(), "project-fixture"),
        (Scope::Global, "global-fixture"),
    ] {
        store
            .create(
                &db,
                scope,
                SecretName::parse("TOKEN").unwrap(),
                SecretValue::from_text(value.into()).unwrap(),
            )
            .unwrap();
    }

    let entries = store.list(&db).unwrap();
    let entry = entries
        .iter()
        .find(|entry| entry.scope == familiar)
        .unwrap();
    assert_eq!(entry.account(), format!("familiar:id/{}", entry.id));
    let encoded = serde_json::to_string(entry).unwrap();
    assert_eq!(*entry, serde_json::from_str::<Entry>(&encoded).unwrap());

    let redact = store.redactor(&db, Some(familiar.clone())).unwrap();
    assert_eq!(
        redact.text("familiar-fixture project-fixture global-fixture"),
        "[secret:TOKEN] project-fixture [secret:TOKEN]"
    );
    store.delete_scope(&db, &familiar).unwrap();
    assert!(store
        .list(&db)
        .unwrap()
        .iter()
        .all(|entry| entry.scope != familiar));
    assert_eq!(
        redact.text("familiar-fixture global-fixture"),
        "familiar-fixture [secret:TOKEN]"
    );
}

#[test]
fn familiar_list_and_run_cannot_resolve_project_credentials() {
    let db = Store::open(Path::new(":memory:")).unwrap();
    let store = SecretStore::new(MemoryBackend::default());
    let scope = Scope::Familiar("own".into());
    let name = SecretName::parse("PROJECT_ONLY").unwrap();
    store
        .create(
            &db,
            Scope::Project("p".into()),
            name.clone(),
            SecretValue::from_text("project-only-fixture".into()).unwrap(),
        )
        .unwrap();
    assert_eq!(
        request::list(&store, &db, Some(scope.clone())).unwrap(),
        serde_json::json!([])
    );
    let scopes = scopes_for(Some(scope.clone())).collect::<Vec<_>>();
    assert_eq!(
        store
            .resolve_names(&db, &scopes, std::slice::from_ref(&name))
            .err()
            .unwrap(),
        "Secret PROJECT_ONLY unavailable."
    );
    let mut request = request::SecretRequest {
        request_id: "fixture".into(),
        session: 42,
        agent: "Fixture".into(),
        name,
        scope: scope.clone(),
        reason: "Need credential".into(),
        status: request::RequestStatus::Open,
        time: 1,
    }
    .prepare(&store, &db, Default::default())
    .unwrap()
    .unwrap();
    request.status = request::RequestStatus::Saved;
    store
        .create(
            &db,
            request.scope,
            request.name,
            SecretValue::from_text("familiar-only-fixture".into()).unwrap(),
        )
        .unwrap();
    assert_eq!(
        super::request::list(&store, &db, Some(scope)).unwrap()[0]["scope"],
        "familiar:own"
    );
}
