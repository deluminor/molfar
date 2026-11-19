use super::*;

#[gpui::test]
fn settings_create_scope_and_revoke_clients(cx: &mut TestAppContext) {
    let f = fixture();
    let window = window(&f, cx);

    let (status, token) = window
        .update(cx, |shell, window, cx| {
            shell.external_create_client(Some("Laptop"), cx).unwrap();
            let status = shell.external_settings_status();
            let token = status.new_key.clone().unwrap().1;
            let id = status.clients[0].id.clone();
            shell.external_toggle_grant(&id, Some(GRANT::BoardCreate), Some(f.granted.clone()), cx);
            shell.external_rename(&id, "Renamed laptop", cx).unwrap();
            assert!(
                shell
                    .external_create_client(Some("RENAMED LAPTOP"), cx)
                    .is_err()
            );
            assert_eq!(
                shell.external_settings_status().new_key.as_ref().unwrap().0,
                "Renamed laptop"
            );
            shell.close_settings(window, cx);
            (shell.external_settings_status(), token)
        })
        .unwrap();

    assert!(!status.enabled);
    assert!(status.new_key.is_none());
    assert_eq!(status.clients[0].grants, [GRANT::BoardCreate]);
    assert_eq!(status.clients[0].projects, std::slice::from_ref(&f.granted));
    let principal = locked(&f.store)
        .unwrap()
        .external_authenticate(&token)
        .unwrap()
        .unwrap();
    assert!(principal.grants.contains(&GRANT::BoardCreate));
    let reopened = Store::open_desktop(&f.root.join("molfar.db")).unwrap();
    assert_eq!(
        reopened
            .external_authenticate(&token)
            .unwrap()
            .unwrap()
            .name,
        "Renamed laptop"
    );

    window
        .update(cx, |shell, _, cx| {
            shell.external_revoke(&status.clients[0].id, cx)
        })
        .unwrap();
    assert!(
        locked(&f.store)
            .unwrap()
            .external_authenticate(&token)
            .unwrap()
            .is_none()
    );
    let status = window
        .update(cx, |shell, _, _| shell.external_settings_status())
        .unwrap();
    assert!(status.clients.is_empty());
}
