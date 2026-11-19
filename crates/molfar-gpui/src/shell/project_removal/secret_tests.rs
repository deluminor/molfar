use super::*;
use gpui::TestAppContext;
use molfar_core::secrets::{Scope, SecretName, SecretStore, SecretValue};

#[gpui::test]
fn delete_project_removes_its_secrets_and_preserves_global_secrets(cx: &mut TestAppContext) {
    let (window, _, id) = crate::shell::tests::window(cx);
    window
        .update(cx, |shell, window, cx| {
            let project = shell.session_metadata(id, cx).summary.cwd;
            let store = SecretStore::in_memory();
            let db = locked(&shell.store).unwrap();
            let scope = store
                .project_scope(&db, std::path::Path::new(&project), Some("Project"))
                .unwrap();
            for scope in [scope, Scope::Global] {
                store
                    .create(
                        &db,
                        scope,
                        SecretName::parse("API_KEY").unwrap(),
                        SecretValue::from_text("fixture-value".into()).unwrap(),
                    )
                    .unwrap();
            }
            drop(db);
            shell.secret_store = store;
            shell.delete_project(&project, window, cx);
        })
        .unwrap();
    cx.run_until_parked();

    window
        .update(cx, |shell, _, _| {
            let db = locked(&shell.store).unwrap();
            let entries = shell.secret_store.list(&db).unwrap();
            assert_eq!(entries.len(), 1);
            assert_eq!(entries[0].scope, Scope::Global);
        })
        .unwrap();
}
