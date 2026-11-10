use super::service::VaultService;
use gpui::{Context, Task};
use molfar_core::knowledge::{ConnectionState, NO_VAULT, NOT_IN_VAULT, shape_index, shape_note};
use serde_json::Value;

impl VaultService {
    pub(crate) fn companion_index(
        &mut self,
        cx: &mut Context<Self>,
    ) -> Task<Result<Value, String>> {
        if !matches!(self.state, ConnectionState::Ready(_)) {
            return Task::ready(Ok(molfar_core::knowledge::disconnected()));
        }
        let scan = self.snapshot(false, cx);
        cx.spawn(async move |_, _| Ok(shape_index(&scan.await?)))
    }

    pub(crate) fn companion_read(
        &mut self,
        path: String,
        cx: &mut Context<Self>,
    ) -> Task<Result<Value, String>> {
        if let Some(error) = self.unavailable() {
            return Task::ready(Err(error));
        }
        let scan = self.snapshot(false, cx);
        let host = self.host.clone();
        cx.spawn(async move |this, cx| {
            let snapshot = scan.await?;
            if !snapshot.notes.iter().any(|note| note.path == path) {
                return Err(NOT_IN_VAULT.into());
            }
            let read = this
                .update(cx, |_, cx| {
                    let host = host.clone();
                    let path = path.clone();
                    cx.background_executor()
                        .spawn(async move { host.read(&path) })
                })
                .map_err(|_| "Vault state is unavailable.".to_string())?;
            let document = read.await?;
            shape_note(&snapshot, &path, &document)
        })
    }

    pub(crate) fn companion_write(
        &mut self,
        path: String,
        body: String,
        revision: String,
        cx: &mut Context<Self>,
    ) -> Task<Result<Value, String>> {
        if let Some(error) = self.unavailable() {
            return Task::ready(Err(error));
        }
        let listed = self.snapshot(false, cx);
        cx.spawn(async move |this, cx| {
            let snapshot = listed.await?;
            if !snapshot.notes.iter().any(|note| note.path == path) {
                return Err(NOT_IN_VAULT.into());
            }
            let save = this
                .update(cx, |this, cx| {
                    this.save_note(path.clone(), body.clone(), revision.clone(), cx)
                })
                .map_err(|_| "Vault state is unavailable.".to_string())?;
            let document = save.await?;
            let scan = this
                .update(cx, |this, cx| this.snapshot(true, cx))
                .map_err(|_| "Vault state is unavailable.".to_string())?;
            shape_note(&scan.await?, &path, &document)
        })
    }

    fn unavailable(&self) -> Option<String> {
        match &self.state {
            ConnectionState::Broken(reason) => Some(reason.clone()),
            ConnectionState::Empty => Some(NO_VAULT.into()),
            ConnectionState::Ready(_) => None,
        }
    }
}
