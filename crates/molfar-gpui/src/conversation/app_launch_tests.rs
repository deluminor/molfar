use super::*;
use gpui::TestAppContext;
use molfar_core::store::Store;
use std::sync::Mutex;

#[gpui::test]
fn stopped_app_launch_cannot_submit_when_history_restores(cx: &mut TestAppContext) {
    let store = Store::open(std::path::Path::new(":memory:")).unwrap();
    let session = store.create("codex", "/project").unwrap();
    let chat = cx.new(|cx| Conversation::new(session, Arc::new(Mutex::new(store)), cx));
    chat.update(cx, |chat, cx| {
        chat.loaded = true;
        chat.history_unloaded = true;
        chat.loading = true;
        chat.settings.model = Some("original-model".into());
        chat.install_app_launch(
            Settings {
                model: Some("cancelled-model".into()),
                ..Default::default()
            },
            true,
            cx,
        );
        assert_eq!(chat.history_actions.len(), 1);
        chat.stop_app_session(cx);
        chat.history_unloaded = false;
        chat.loading = false;
        chat.run_history_actions(cx);
        assert!(chat.history_actions.is_empty());
        assert!(!chat.busy);
        assert_eq!(chat.settings.model.as_deref(), Some("original-model"));
    });
}

#[gpui::test]
fn new_app_launch_after_stop_survives_history_restore(cx: &mut TestAppContext) {
    let store = Store::open(std::path::Path::new(":memory:")).unwrap();
    let session = store.create("codex", "/project").unwrap();
    let chat = cx.new(|cx| Conversation::new(session, Arc::new(Mutex::new(store)), cx));
    chat.update(cx, |chat, cx| {
        chat.loaded = true;
        chat.history_unloaded = true;
        chat.loading = true;
        chat.stop_app_session(cx);
        chat.install_app_launch(
            Settings {
                model: Some("new-model".into()),
                ..Default::default()
            },
            false,
            cx,
        );
        chat.history_unloaded = false;
        chat.loading = false;
        chat.run_history_actions(cx);
        assert!(chat.history_actions.is_empty());
        assert_eq!(chat.settings.model.as_deref(), Some("new-model"));
    });
}
