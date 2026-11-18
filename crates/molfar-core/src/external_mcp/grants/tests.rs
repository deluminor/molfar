use super::{
    super::{constants::CLIENTS_KEY, types::ServerConfig},
    types::{ClientUpdate, DOMAIN, GRANT},
};
use crate::store::Store;

fn store() -> Store {
    Store::open(std::path::Path::new(":memory:")).unwrap()
}

#[test]
fn config_is_disabled_by_default_and_persists_the_port() {
    let store = store();

    let initial = store.external_config().unwrap();
    store
        .save_external_config(&ServerConfig {
            enabled: true,
            port: 50_000,
        })
        .unwrap();

    assert!(!initial.enabled);
    assert_eq!(store.external_config().unwrap().port, 50_000);
    assert!(store
        .save_external_config(&ServerConfig {
            enabled: true,
            port: 80
        })
        .is_err());
}

#[test]
fn credentials_authenticate_until_revoked_and_store_only_verifiers() {
    let store = store();
    let projects = vec!["/project".to_owned()];

    let (client, token) = store
        .external_create_client(
            " OpenBot ",
            &[
                GRANT::BoardCreate,
                GRANT::Read(DOMAIN::Board),
                GRANT::Read(DOMAIN::Board),
            ],
            &projects,
        )
        .unwrap();
    let principal = store.external_authenticate(&token).unwrap().unwrap();

    assert_eq!(client.name, "OpenBot");
    assert_eq!(
        principal.grants,
        [GRANT::BoardCreate, GRANT::Read(DOMAIN::Board)]
    );
    assert_eq!(principal.projects, projects);
    let stored = store.setting("external-mcp:clients").unwrap().unwrap();
    assert!(!stored.contains(&token));
    let mut tampered = token.clone();
    tampered.pop();
    tampered.push('x');
    for bad in ["", "Bearer", "mfx_", &tampered, "mfx_unknown_secret"] {
        assert!(store.external_authenticate(bad).unwrap().is_none(), "{bad}");
    }

    store.external_revoke_client(&client.id).unwrap();

    assert!(store.external_authenticate(&token).unwrap().is_none());
    assert!(store
        .external_update_client(
            &client.id,
            ClientUpdate {
                name: None,
                grants: &[GRANT::Read(DOMAIN::Board)],
                projects: &projects,
                resources: &[]
            }
        )
        .is_err());
}

#[test]
fn grant_changes_apply_to_the_next_authentication() {
    let store = store();
    let (client, token) = store
        .external_create_client("OpenBot", &[GRANT::Read(DOMAIN::Board)], &["/a".into()])
        .unwrap();

    store
        .external_update_client(
            &client.id,
            ClientUpdate {
                name: None,
                grants: &[GRANT::SessionsStop],
                projects: &["/b".into()],
                resources: &[],
            },
        )
        .unwrap();

    let principal = store.external_authenticate(&token).unwrap().unwrap();
    assert!(!principal.grants.contains(&GRANT::Read(DOMAIN::Board)));
    assert!(principal.grants.contains(&GRANT::SessionsStop));
    assert_eq!(principal.projects, ["/b"]);
    assert!(store.external_create_client(" ", &[], &[]).is_err());
}

#[test]
fn legacy_clients_migrate_once_and_explicit_empty_grants_win() {
    let store = store();
    store.save_setting(CLIENTS_KEY, r#"[
        {"id":"a","name":"A","verifier":"x","scopes":["read","future"],"projects":[],"createdAt":0},
        {"id":"b","name":"B","verifier":"x","scopes":["submit"],"grants":[],"projects":[],"createdAt":0}
    ]"#).unwrap();

    let clients = store.external_clients().unwrap();
    assert_eq!(
        clients[0].grants,
        [GRANT::Read(DOMAIN::Board), GRANT::Read(DOMAIN::Sessions)]
    );
    assert!(clients[1].grants.is_empty());
    let normalized = store.setting(CLIENTS_KEY).unwrap().unwrap();
    assert!(!normalized.contains("scopes"));
    assert_eq!(store.external_clients().unwrap(), clients);
    assert_eq!(store.setting(CLIENTS_KEY).unwrap().unwrap(), normalized);
}

#[test]
fn invalid_explicit_grants_never_fall_back_to_legacy_permissions() {
    let store = store();
    store.save_setting(CLIENTS_KEY, r#"[
        {"id":"a","name":"A","verifier":"x","scopes":["read"],"grants":null,"projects":[],"createdAt":0}
    ]"#).unwrap();
    assert!(store.external_clients().is_err());
}

#[test]
fn migration_keeps_legacy_clients_within_their_mapped_grants() {
    use crate::external_mcp::tools;
    let legacy = [
        (
            "read",
            &[
                "projects_list",
                "sessions_list",
                "sessions_read",
                "board_list",
                "board_read",
                "board_artifacts_list",
                "board_artifacts_read",
            ][..],
        ),
        (
            "submit",
            &[
                "sessions_start",
                "sessions_send",
                "board_create",
            ][..],
        ),
        ("stop", &["sessions_stop"][..]),
    ];
    for mask in 0..8 {
        let store = store();
        let mut scopes = Vec::new();
        let mut expected = Vec::new();
        for (index, (scope, names)) in legacy.iter().enumerate() {
            if mask & (1 << index) != 0 {
                scopes.push(scope);
                expected.extend_from_slice(names);
            }
        }
        let entry = serde_json::json!([{
            "id":"a", "name":"A", "verifier":"x", "scopes":scopes,
            "projects":["/work"], "createdAt":0
        }]);
        store.save_setting(CLIENTS_KEY, &entry.to_string()).unwrap();
        let client = store.external_clients().unwrap().pop().unwrap();
        let principal = crate::external_mcp::types::Principal {
            client_id: client.id,
            name: client.name,
            grants: client.grants,
            resources: client.resources,
            projects: client.projects,
        };

        let mut actual: Vec<_> = tools::visible(&principal)
            .iter()
            .map(|tool| tool.name)
            .collect();
        actual.sort_unstable();
        expected.sort_unstable();
        assert_eq!(actual, expected, "legacy subset {scopes:?}");
        assert_eq!(principal.projects, ["/work"]);
    }
}

#[test]
fn names_are_bounded_unique_and_persist_without_changing_credentials() {
    let directory = tempfile::tempdir().unwrap();
    let path = directory.path().join("molfar.db");
    let store = Store::open(&path).unwrap();
    let (client, token) = store
        .external_create_client(" Client 1 ", &[], &[])
        .unwrap();
    assert!(client.grants.is_empty() && client.resources.is_empty());
    assert_eq!(
        super::naming::default_name(&store.external_clients().unwrap()),
        "Client 2"
    );

    for invalid in ["", &"é".repeat(41), "CLIENT 1"] {
        assert!(store.external_create_client(invalid, &[], &[]).is_err());
    }
    let (second, _) = store.external_create_client("Laptop", &[], &[]).unwrap();
    let rename = |name| ClientUpdate {
        name: Some(name),
        grants: &[],
        projects: &[],
        resources: &[],
    };
    assert!(store
        .external_update_client(&client.id, rename(" laptop "))
        .is_err());
    assert!(store
        .external_update_client(&client.id, rename(" "))
        .is_err());
    store.external_revoke_client(&second.id).unwrap();
    let renamed = store
        .external_update_client(&client.id, rename(" Laptop "))
        .unwrap();
    assert_eq!(renamed.verifier, client.verifier);
    drop(store);

    let reopened = Store::open(&path).unwrap();
    let principal = reopened.external_authenticate(&token).unwrap().unwrap();
    assert_eq!(principal.name, "Laptop");
    assert_eq!(principal.client_id, client.id);
    assert_eq!(
        super::naming::default_name(&reopened.external_clients().unwrap()),
        "Client 1"
    );
}
