use super::*;

pub(super) fn project_secret_count(
    store: &molfar_core::secrets::SecretStore,
    db: &molfar_core::store::Store,
    path: &str,
) -> Result<usize, String> {
    let Some(scope) = secret_scope(store, db, path)? else {
        return Ok(0);
    };
    store
        .list(db)
        .map(|entries| entries.iter().filter(|entry| entry.scope == scope).count())
        .map_err(|error| error.to_string())
}

fn secret_scope(
    store: &molfar_core::secrets::SecretStore,
    db: &molfar_core::store::Store,
    path: &str,
) -> Result<Option<molfar_core::secrets::Scope>, String> {
    if path.starts_with("remote://") {
        return Ok(None);
    }
    match store.project_scope(db, std::path::Path::new(path), None) {
        Ok(scope) => Ok(Some(scope)),
        Err(molfar_core::secrets::Error::Missing) => Ok(None),
        Err(error) => Err(error.to_string()),
    }
}

impl Shell {
    pub(super) fn delete_project_secrets(&self, path: &str, cx: &mut Context<Self>) {
        let path = path.to_owned();
        let database = self.store.clone();
        let store = self.secret_store.clone();
        let work = cx.background_executor().spawn(async move {
            let db = locked(&database)?;
            if let Some(scope) = secret_scope(&store, &db, &path)? {
                if let Err(error) = store.delete_scope(&db, &scope) {
                    if let Ok(entries) = store.list(&db) {
                        for entry in entries
                            .into_iter()
                            .filter(|entry| entry.scope == scope && entry.delete_failed)
                        {
                            log::warn!(
                                "Secret deletion failed for {} in {}",
                                entry.name.as_str(),
                                scope
                            );
                        }
                    }
                    return Err(error.to_string());
                }
            }
            Ok::<_, String>(())
        });
        cx.spawn(async move |this, cx| {
            let result = work.await;
            let _ = this.update(cx, |this, cx| {
                if let Err(error) = result {
                    this.error = Some(format!("Project secrets: {error} Retry in Settings."));
                }
                this.sync_settings(cx);
                cx.notify();
            });
        })
        .detach();
    }
}
