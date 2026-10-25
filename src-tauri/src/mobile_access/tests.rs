use super::*;
#[test]
fn commands_prefer_the_live_busy_owner_and_choose_stably_between_idle_windows() {
    let catalogs = HashMap::from([
        (
            "main".into(),
            json!({"sessions":[{"id":"s","live":false}],"projects":[{"id":"p"}]}),
        ),
        (
            "workspace-1".into(),
            json!({"sessions":[{"id":"s","live":true,"busy":true}],"projects":[{"id":"p"}]}),
        ),
    ]);
    assert_eq!(
        pick_owner(&catalogs, "conversation.send", "s").as_deref(),
        Some("workspace-1")
    );
    assert_eq!(
        pick_owner(&catalogs, "session.start", "p").as_deref(),
        Some("main")
    );
    assert!(pick_owner(&catalogs, "conversation.read", "missing").is_none());
}
#[test]
fn the_poll_carries_recent_sessions_and_pages_serve_the_rest() {
    let sessions: Vec<Value> = (0..30)
        .map(|i| json!({"id":format!("s{i}"),"projectId":"p","title":format!("Task {i}"),"busy":i == 25}))
        .chain([json!({"id":"m","projectId":"p","familiarId":"familiar"})])
        .collect();
    let sessions = json!(sessions);
    let recent = recent_sessions(&sessions);
    assert_eq!(recent.len(), RECENT_SESSIONS + 2);
    assert!(recent.iter().any(|s| s["id"] == "s25"));

    let page = session_page(&sessions, &json!({"projectId":"p","offset":28,"limit":10}));
    assert_eq!(page["sessions"].as_array().unwrap().len(), 3);
    assert_eq!(page["hasMore"], false);
    let page = session_page(&sessions, &json!({"projectId":"p","limit":2}));
    assert_eq!(page["hasMore"], true);
    let found = session_page(&sessions, &json!({"projectId":"p","query":"task 2"}));
    assert_eq!(found["sessions"].as_array().unwrap().len(), 11);
    let filtered: Vec<Value> = [
        json!({"id":"a","projectId":"p","harness":"claude","updatedAt":200}),
        json!({"id":"b","projectId":"p","harness":"codex","updatedAt":300}),
        json!({"id":"c","projectId":"p","harness":"claude","updatedAt":100}),
    ]
    .into();
    let filtered = json!(filtered);
    let ids = |params: Value| -> Vec<String> {
        session_page(&filtered, &params)["sessions"]
            .as_array()
            .unwrap()
            .iter()
            .map(|s| s["id"].as_str().unwrap().to_string())
            .collect()
    };
    assert_eq!(ids(json!({"projectId":"p","since":150})), ["a", "b"]);
    assert_eq!(
        ids(json!({"projectId":"p","hiddenHarnesses":["codex"]})),
        ["a", "c"]
    );
    assert!(
        session_page(&sessions, &json!({"projectId":"q"}))["sessions"]
            .as_array()
            .unwrap()
            .is_empty()
    );
}
#[test]
fn session_commands_have_stable_device_scoped_ids_across_restarts() {
    let id = session_id("device-a:request-a");
    assert_eq!(id, session_id("device-a:request-a"));
    assert_ne!(id, session_id("device-b:request-a"));
    assert!(uuid::Uuid::parse_str(&id).is_ok());
}
fn fixture() -> (MobileHost, Identity, Identity) {
    let join = Identity::generate().unwrap();
    let phone = Identity::generate().unwrap();
    let key = join.fingerprint().unwrap();
    let gate = Gate::default();
    gate.allow(key.clone(), Some(now() + 900));
    let path = std::env::temp_dir()
        .join(format!("molfar-mobile-test-{}", uuid::Uuid::new_v4()))
        .join("settings.json");
    let mut invitations = HashMap::new();
    invitations.insert(
        key,
        Invitation {
            expires: now() + 900,
        },
    );
    let host = MobileHost {
        gate,
        path,
        inner: Arc::new(Mutex::new(Inner {
            config: Config {
                enabled: true,
                ..Config::default()
            },
            identity: Some(Identity::generate().unwrap()),
            endpoint: None,
            invitations,
            catalogs: HashMap::new(),
            pending: HashMap::new(),
            watches: HashMap::new(),
            router_address: None,
            router_status: "Off".into(),
            router_started: false,
        })),
    };
    (host, join, phone)
}
#[test]
fn invitation_is_consumed_once_and_only_public_device_metadata_is_persisted() {
    let (host, join, phone) = fixture();
    let key = join.fingerprint().unwrap();
    let params =
        json!({"certificate":phone.certificate,"proof":phone.proof(&key).unwrap(),"name":"iPhone"});
    let mut inner = host.inner.lock().unwrap();
    let result = enroll(&host, &mut inner, &key, &params).unwrap();
    assert!(result["deviceId"].is_string());
    assert!(!host.gate.admits(&key));
    assert!(host.gate.admits(&phone.fingerprint().unwrap()));
    assert!(enroll(&host, &mut inner, &key, &params).is_err());
    let saved = std::fs::read_to_string(&host.path).unwrap();
    assert!(!saved.contains("privateKey") && !saved.contains(&phone.private_key));
    assert_eq!(inner.config.devices.len(), 1);
    std::fs::remove_dir_all(host.path.parent().unwrap()).unwrap();
}
#[test]
fn invalid_proof_or_expiration_does_not_consume_an_invitation_or_enroll_a_device() {
    let (host, join, phone) = fixture();
    let key = join.fingerprint().unwrap();
    let mut inner = host.inner.lock().unwrap();
    let params = json!({"certificate":phone.certificate,"proof":phone.proof("different-invitation").unwrap()});
    assert!(enroll(&host, &mut inner, &key, &params).is_err());
    assert!(inner.config.devices.is_empty() && inner.invitations.contains_key(&key));
    inner.invitations.get_mut(&key).unwrap().expires = now() - 1;
    let params = json!({"certificate":phone.certificate,"proof":phone.proof(&key).unwrap()});
    assert!(enroll(&host, &mut inner, &key, &params).is_err());
    assert!(inner.config.devices.is_empty() && !host.path.exists());
}
