use super::Automations;
use gpui::{AppContext, TestAppContext};
use molfar_core::automations::{AutomationUpsert, Service};
use std::sync::{Arc, Mutex};

#[gpui::test]
fn an_automation_asked_for_before_the_list_loads_is_selected_once_it_does(cx: &mut TestAppContext) {
    let mut service = Service::open(std::path::Path::new(":memory:")).unwrap();
    let mut draft = AutomationUpsert::new("/repo".into(), "codex".into(), "model".into());
    draft.name = "Nightly review".into();
    draft.prompt = "Review".into();
    let saved = service.upsert(draft).unwrap();
    let service = Arc::new(Mutex::new(service));

    let view = cx.new(|cx| Automations::new(service, "/repo".into(), vec!["/repo".into()], cx));
    view.update(cx, |view, cx| {
        view.automations.clear();
        view.open_automation(saved.id.clone(), cx);
        assert_eq!(view.pending_select.as_deref(), Some(saved.id.as_str()));
    });
    cx.run_until_parked();

    view.read_with(cx, |view, _| {
        assert_eq!(view.selected.as_deref(), Some(saved.id.as_str()));
        assert!(view.pending_select.is_none());
    });
}
