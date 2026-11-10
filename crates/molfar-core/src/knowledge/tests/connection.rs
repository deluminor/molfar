use super::super::*;
use super::Fixture;

#[test]
fn load_does_not_rewrite_the_connection_file() {
    let vault = Fixture::new();
    let data = Fixture::new();
    let saved = VaultConnection {
        id: "11111111-aaaa-4444-bbbb-111111111111".into(),
        root: vault.0.to_string_lossy().into_owned(),
        name: "Vault".into(),
    };
    let bytes = serde_json::to_vec(&saved).unwrap();
    std::fs::write(data.0.join(constants::CONNECTION_FILE), &bytes).unwrap();
    let host = VaultHost::new();
    let state = host.load(&data.0).unwrap();
    let ConnectionState::Ready(connection) = state else {
        panic!("expected a ready vault");
    };
    assert_eq!(connection.root, saved.root);
    assert_eq!(connection.name, saved.name);
    assert_ne!(connection.id, saved.id);
    assert_eq!(
        std::fs::read(data.0.join(constants::CONNECTION_FILE)).unwrap(),
        bytes
    );
}

#[test]
fn connect_writes_and_disconnect_removes_the_file() {
    let vault = Fixture::new();
    let data = Fixture::new();
    let host = VaultHost::new();
    let connection = host.connect(&data.0, &vault.0.to_string_lossy()).unwrap();
    assert!(paths::validate_connection_id(&connection.id).is_ok());
    let file = data.0.join(constants::CONNECTION_FILE);
    let on_disk: VaultConnection = serde_json::from_slice(&std::fs::read(&file).unwrap()).unwrap();
    assert_eq!(on_disk, connection);
    host.disconnect(&data.0).unwrap();
    assert!(!file.exists());
    assert_eq!(host.state().unwrap(), ConnectionState::Empty);
}

#[test]
fn an_invalid_root_is_reported_without_rewriting_the_file() {
    let data = Fixture::new();
    let file = data.0.join("not-a-directory");
    std::fs::write(&file, "x").unwrap();
    let saved = VaultConnection {
        id: "11111111-aaaa-4444-bbbb-111111111111".into(),
        root: file.to_string_lossy().into_owned(),
        name: "Missing".into(),
    };
    let bytes = serde_json::to_vec(&saved).unwrap();
    std::fs::write(data.0.join(constants::CONNECTION_FILE), &bytes).unwrap();
    let host = VaultHost::new();
    let ConnectionState::Broken(reason) = host.load(&data.0).unwrap() else {
        panic!("expected a broken connection");
    };
    assert_eq!(reason, "Vault path must be a directory.");
    assert_eq!(
        std::fs::read(data.0.join(constants::CONNECTION_FILE)).unwrap(),
        bytes
    );
    assert_eq!(
        host.companion_index().unwrap(),
        serde_json::json!({"connected": false})
    );
}
