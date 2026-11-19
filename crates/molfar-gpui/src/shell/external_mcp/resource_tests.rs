use super::super::{
    tests::{fixture, window},
    *,
};
use gpui::TestAppContext;
use molfar_core::external_mcp::grants::types::{RESOURCE, ResourceGrant};

#[gpui::test]
fn settings_resource_toggles_persist_and_reject_revoked_clients(cx: &mut TestAppContext) {
    let fixture = fixture();
    let window = window(&fixture, cx);
    let (client, key) = locked(&fixture.store)
        .unwrap()
        .external_create_client("Test client", &[], &[])
        .unwrap();
    let resource = ResourceGrant {
        kind: RESOURCE::InboxProvider,
        id: "jira".into(),
    };
    assert!(client.grants.is_empty());
    assert!(client.resources.is_empty());
    assert!(
        window
            .update(cx, |shell, _, cx| shell
                .external_resources(cx)
                .iter()
                .any(|option| option.grant == resource))
            .unwrap()
    );

    window
        .update(cx, |shell, _, cx| {
            shell.external_toggle_resource(&client.id, resource.clone(), cx)
        })
        .unwrap()
        .unwrap();
    let authenticated = locked(&fixture.store)
        .unwrap()
        .external_authenticate(&key)
        .unwrap()
        .unwrap();
    assert!(authenticated.reaches(RESOURCE::InboxProvider, "jira"));
    assert!(authenticated.grants.is_empty());

    window
        .update(cx, |shell, _, cx| {
            shell.external_toggle_resource(&client.id, resource.clone(), cx)
        })
        .unwrap()
        .unwrap();
    assert!(
        locked(&fixture.store)
            .unwrap()
            .external_authenticate(&key)
            .unwrap()
            .unwrap()
            .resources
            .is_empty()
    );

    window
        .update(cx, |shell, _, cx| shell.external_revoke(&client.id, cx))
        .unwrap();
    assert!(
        window
            .update(cx, |shell, _, cx| shell
                .external_toggle_resource(&client.id, resource, cx))
            .unwrap()
            .is_err()
    );
    assert!(
        locked(&fixture.store)
            .unwrap()
            .external_authenticate(&key)
            .unwrap()
            .is_none()
    );
}
