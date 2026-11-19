use super::{
    tests::{call, fixture, principal, window},
    *,
};
use gpui::TestAppContext;
use molfar_core::{
    automations::{AutomationUpsert, Service},
    external_mcp::grants::types::{DOMAIN, GRANT},
};
use std::sync::{Arc, Mutex};

fn install(
    window: gpui::WindowHandle<Shell>,
    service: Arc<Mutex<Service>>,
    cx: &mut TestAppContext,
) {
    window
        .update(cx, |shell, _, _| {
            shell.automation_state.service = Some(service);
        })
        .unwrap();
}

fn seed(service: &Mutex<Service>, cwd: &str, name: &str) -> molfar_core::automations::Automation {
    let mut draft = AutomationUpsert::new(cwd.into(), "codex".into(), "gpt-test".into());
    draft.name = name.into();
    draft.prompt = format!("private prompt {name}");
    draft.runtime_mode = "supervised".into();
    draft.model_settings.insert("effort".into(), "high".into());
    draft.triggers = Some(Vec::new());
    draft.enabled = false;
    service.lock().unwrap().upsert(draft).unwrap()
}

#[gpui::test]
fn automation_tools_stay_inside_granted_projects_and_stored_rights(cx: &mut TestAppContext) {
    let f = fixture();
    let window = window(&f, cx);
    let service = Arc::new(Mutex::new(
        Service::open(std::path::Path::new(":memory:")).unwrap(),
    ));
    let visible = seed(&service, &f.granted, "Visible");
    let hidden = seed(&service, &f.other, "Hidden");
    install(window, service.clone(), cx);

    let mut client = principal(&f);
    let listed = call(window, &client, "automations_list", json!({}), cx);
    assert!(listed.unwrap_err().contains("lacks permission"));
    client.grants.extend([
        GRANT::Read(DOMAIN::Automations),
        GRANT::Write(DOMAIN::Automations),
    ]);

    let listed = call(window, &client, "automations_list", json!({}), cx).unwrap();
    assert_eq!(listed["automations"].as_array().unwrap().len(), 1);
    assert_eq!(listed["automations"][0]["name"], "Visible");
    let rendered = listed.to_string();
    for forbidden in [
        "Hidden",
        "supervised",
        "gpt-test",
        "harness",
        "modelSettings",
    ] {
        assert!(!rendered.contains(forbidden), "{forbidden}");
    }
    assert_eq!(
        call(
            window,
            &client,
            "automations_read",
            json!({"automationId": hidden.id}),
            cx
        ),
        Err("Automation not found.".into())
    );

    let update = json!({
        "automationId": visible.id,
        "name": "Renamed",
        "prompt": "private prompt after edit",
        "requestId": "edit"
    });
    assert!(
        call(window, &client, "automations_upsert", update.clone(), cx)
            .unwrap_err()
            .contains("lacks permission")
    );
    let mut widened = update.clone();
    widened["project"] = json!(f.other);
    assert!(
        call(window, &client, "automations_upsert", widened, cx)
            .unwrap_err()
            .contains("Project cannot be changed")
    );
    client.grants.push(GRANT::Delegated);
    assert_eq!(
        call(window, &client, "automations_upsert", update, cx).unwrap()["automationId"],
        visible.id
    );
    let stored = service.lock().unwrap().read(&visible.id).unwrap().unwrap();
    assert_eq!(stored.name, "Renamed");
    assert_eq!(stored.cwd, visible.cwd);
    assert_eq!(stored.harness, visible.harness);
    assert_eq!(stored.model, visible.model);
    assert_eq!(stored.runtime_mode, visible.runtime_mode);
    assert_eq!(stored.model_settings, visible.model_settings);

    let remove = json!({"automationId": visible.id, "requestId": "remove"});
    assert!(
        call(window, &client, "automations_delete", remove.clone(), cx)
            .unwrap_err()
            .contains("lacks permission")
    );
    let input = json!({"automationId": visible.id, "requestId": "interrupted"});
    let pending = locked(&f.store)
        .unwrap()
        .external_receipt_begin(
            &client.client_id,
            &ReceiptTarget::Project(molfar_core::files::path_key(&f.granted)),
            "automations_run_now",
            "interrupted",
            &receipts::digest("automations_run_now", &input),
        )
        .unwrap();
    assert_eq!(pending, BEGIN::Fresh);
    assert_eq!(
        call(window, &client, "automations_run_now", input, cx),
        Err(OUTCOME_UNKNOWN.into())
    );
    assert!(
        service
            .lock()
            .unwrap()
            .runs(&visible.id)
            .unwrap()
            .is_empty()
    );

    client.grants.push(GRANT::Destructive);
    assert_eq!(
        call(window, &client, "automations_delete", remove, cx).unwrap()["deleted"],
        true
    );
    let audit = locked(&f.store).unwrap().external_audit_log().unwrap();
    assert!(
        audit
            .iter()
            .any(|entry| { entry.outcome == "denied" && entry.action == "automations_read" })
    );
    assert!(
        audit
            .iter()
            .any(|entry| { entry.outcome == "unknown" && entry.action == "automations_run_now" })
    );
    assert!(
        !serde_json::to_string(&audit)
            .unwrap()
            .contains("private prompt")
    );
}
