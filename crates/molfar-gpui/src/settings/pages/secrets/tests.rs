use super::*;
use gpui::TestAppContext;
use molfar_core::secrets::{Scope, SecretName, SecretValue};
use std::sync::{Arc, Mutex};

const ORIGINAL: &str = "fixture-old-credential";
const REPLACEMENT: &str = "fixture-replaced-credential";

#[gpui::test]
fn settings_manages_credentials_without_revealing_them(cx: &mut TestAppContext) {
    let db = Arc::new(Mutex::new(
        molfar_core::store::Store::open(Path::new(":memory:")).unwrap(),
    ));
    let secrets = SecretStore::in_memory();
    let (view, visual) =
        cx.add_window_view(|_, cx| SecretsPage::new(db.clone(), secrets.clone(), Vec::new(), cx));
    visual.run_until_parked();

    let entry = |view: &SecretsPage| {
        view.entries
            .first()
            .cloned()
            .expect("visible secret metadata")
    };
    visual.update_window_entity(&view, |view, window, cx| {
        view.name
            .update(cx, |input, cx| input.set_text("API_KEY".into(), cx));
        view.value
            .update(cx, |input, cx| input.set_text(ORIGINAL.into(), cx));
        view.apply(Edit::Add, window, cx);
    });
    visual.run_until_parked();
    visual.update_window_entity(&view, |view, window, cx| {
        let saved = entry(view);
        assert_eq!(saved.scope, Scope::Global);
        assert!(view.value.read(cx).content.is_empty());
        assert!(!serde_json::to_string(&saved).unwrap().contains(ORIGINAL));
        view.value
            .update(cx, |input, cx| input.set_text(REPLACEMENT.into(), cx));
        view.apply(Edit::Replace(saved), window, cx);
    });
    visual.simulate_prompt_answer("Replace");
    visual.run_until_parked();

    let redactor = secrets.redactor(&locked(&db).unwrap(), None).unwrap();
    assert_eq!(redactor.text(ORIGINAL), "[secret:API_KEY]");
    assert_eq!(redactor.text(REPLACEMENT), "[secret:API_KEY]");
    visual.update_window_entity(&view, |view, window, cx| {
        assert!(view.value.read(cx).content.is_empty());
        view.name
            .update(cx, |input, cx| input.set_text("RENAMED".into(), cx));
        view.apply(Edit::Rename(entry(view)), window, cx);
    });
    visual.run_until_parked();
    assert_eq!(redactor.text(REPLACEMENT), "[secret:RENAMED]");

    visual.update_window_entity(&view, |view, window, cx| {
        view.confirm_entry("Delete", entry(view), window, cx, |store, db, entry| {
            store
                .delete(db, &entry.id)
                .map_err(|error| error.to_string())
        });
    });
    visual.simulate_prompt_answer("Cancel");
    visual.run_until_parked();
    assert_eq!(redactor.text(REPLACEMENT), "[secret:RENAMED]");
    visual.update_window_entity(&view, |view, window, cx| {
        view.confirm_entry("Delete", entry(view), window, cx, |store, db, entry| {
            store
                .delete(db, &entry.id)
                .map_err(|error| error.to_string())
        });
    });
    visual.simulate_prompt_answer("Delete");
    visual.run_until_parked();
    assert!(secrets.list(&locked(&db).unwrap()).unwrap().is_empty());
}

#[gpui::test]
fn settings_labels_missing_projects_and_preserves_existing_names(cx: &mut TestAppContext) {
    let db = Arc::new(Mutex::new(
        molfar_core::store::Store::open(Path::new(":memory:")).unwrap(),
    ));
    let secrets = SecretStore::in_memory();
    let db_handle = locked(&db).unwrap();
    let missing_path = std::env::temp_dir().join(uuid::Uuid::new_v4().to_string());
    let scope = secrets
        .project_scope(&db_handle, &missing_path, Some("Old location"))
        .unwrap();
    for scope in [Scope::Global, scope.clone()] {
        secrets
            .create(
                &db_handle,
                scope,
                SecretName::parse("API_KEY").unwrap(),
                SecretValue::from_text(ORIGINAL.into()).unwrap(),
            )
            .unwrap();
    }
    drop(db_handle);

    let (view, visual) =
        cx.add_window_view(|_, cx| SecretsPage::new(db.clone(), secrets.clone(), Vec::new(), cx));
    visual.run_until_parked();
    visual.update_window_entity(&view, |view, window, cx| {
        assert!(view.scope_label(&scope).contains("Missing project"));
        assert_eq!(view.entries.len(), 2);
        view.name
            .update(cx, |input, cx| input.set_text("API_KEY".into(), cx));
        view.value
            .update(cx, |input, cx| input.set_text(REPLACEMENT.into(), cx));
        view.apply(Edit::Add, window, cx);
    });
    visual.run_until_parked();
    visual.update_window_entity(&view, |view, _, cx| {
        assert_eq!(view.entries.len(), 2);
        assert!(view.error.as_deref().unwrap().contains("already exists"));
        assert!(view.value.read(cx).content.is_empty());
    });
}
