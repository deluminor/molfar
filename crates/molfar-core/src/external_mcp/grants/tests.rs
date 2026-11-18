use super::super::types::{ServerConfig, SCOPE};
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
            &[SCOPE::Submit, SCOPE::Read, SCOPE::Read],
            &projects,
        )
        .unwrap();
    let principal = store.external_authenticate(&token).unwrap().unwrap();

    assert_eq!(client.name, "OpenBot");
    assert_eq!(principal.scopes, [SCOPE::Read, SCOPE::Submit]);
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
        .external_update_client(&client.id, &[SCOPE::Read], &projects)
        .is_err());
}

#[test]
fn grant_changes_apply_to_the_next_authentication() {
    let store = store();
    let (client, token) = store
        .external_create_client("OpenBot", &[SCOPE::Read], &["/a".into()])
        .unwrap();

    store
        .external_update_client(&client.id, &[SCOPE::Stop], &["/b".into()])
        .unwrap();

    let principal = store.external_authenticate(&token).unwrap().unwrap();
    assert!(!principal.allows(SCOPE::Read));
    assert!(principal.allows(SCOPE::Stop));
    assert_eq!(principal.projects, ["/b"]);
    assert!(store.external_create_client(" ", &[], &[]).is_err());
}
