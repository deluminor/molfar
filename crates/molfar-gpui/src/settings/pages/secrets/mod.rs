mod editor;
mod list;

use crate::{
    input::{self, Input},
    runtime::{Database, locked},
    settings::widgets::{note, primary_button},
};
use gpui::{Context, Entity, Render, Subscription, Window, div, prelude::*};
use molfar_core::secrets::{Entry, Project, SecretStore};
use std::path::Path;

use editor::Edit;

pub(in crate::settings) struct SecretsPage {
    database: Database,
    store: SecretStore,
    workspace: Vec<(String, String)>,
    entries: Vec<Entry>,
    scopes: Vec<Project>,
    edit: Option<Edit>,
    name: Entity<Input>,
    value: Entity<Input>,
    scope: Option<usize>,
    choosing_scope: bool,
    error: Option<String>,
    busy: bool,
    _subscriptions: [Subscription; 2],
}

impl SecretsPage {
    pub(in crate::settings) fn new(
        database: Database,
        store: SecretStore,
        workspace: Vec<(String, String)>,
        cx: &mut Context<Self>,
    ) -> Self {
        let name =
            cx.new(|cx| Input::field("Secret name", "API_KEY", crate::theme::content(0.35), cx));
        let value = cx.new(Input::secret_field);
        let subscriptions = [&name, &value]
            .map(|field| cx.subscribe(field, |_, _, _: &input::Changed, cx| cx.notify()));
        let mut this = Self {
            database,
            store,
            workspace,
            entries: Vec::new(),
            scopes: Vec::new(),
            edit: None,
            name,
            value,
            scope: None,
            choosing_scope: false,
            error: None,
            busy: false,
            _subscriptions: subscriptions,
        };
        this.reload(cx);
        this
    }

    pub(in crate::settings) fn refresh(
        &mut self,
        workspace: Vec<(String, String)>,
        cx: &mut Context<Self>,
    ) {
        if self.workspace != workspace {
            self.clear_form(cx);
            self.workspace = workspace;
            self.reload(cx);
        }
    }

    pub(in crate::settings) fn reload(&mut self, cx: &mut Context<Self>) {
        self.run(false, |_, _| Ok(()), cx);
    }

    fn run(
        &mut self,
        clear_on_success: bool,
        action: impl FnOnce(&SecretStore, &molfar_core::store::Store) -> Result<(), String>
        + Send
        + 'static,
        cx: &mut Context<Self>,
    ) {
        if self.busy {
            return;
        }
        self.busy = true;
        if clear_on_success {
            self.error = None;
        }
        let database = self.database.clone();
        let store = self.store.clone();
        let workspace = self.workspace.clone();
        let work = cx.background_executor().spawn(async move {
            let db = locked(&database)?;
            for (path, label) in workspace {
                if path.starts_with("remote://") || !Path::new(&path).is_dir() {
                    continue;
                }
                match store.project_scope(&db, Path::new(&path), None) {
                    Ok(_) => {
                        store
                            .project_scope(&db, Path::new(&path), Some(&label))
                            .map_err(|error| error.to_string())?;
                    }
                    Err(molfar_core::secrets::Error::Missing) => {}
                    Err(error) => return Err(error.to_string()),
                }
            }
            let result = action(&store, &db);
            let entries = store.list(&db).map_err(|error| error.to_string())?;
            let scopes = store.projects(&db).map_err(|error| error.to_string())?;
            Ok::<_, String>((result, entries, scopes))
        });
        cx.spawn(async move |this, cx| {
            let result = work.await;
            let _ = this.update(cx, |this, cx| {
                this.busy = false;
                match result {
                    Ok((action, entries, scopes)) => {
                        this.entries = entries;
                        this.scopes = scopes;
                        match action {
                            Ok(()) if clear_on_success => this.clear_form(cx),
                            Ok(()) => (),
                            Err(error) => this.error = Some(error),
                        }
                    }
                    Err(error) => this.error = Some(error),
                }
                cx.notify();
            });
        })
        .detach();
        cx.notify();
    }

    fn clear_form(&mut self, cx: &mut Context<Self>) {
        self.edit = None;
        self.error = None;
        self.choosing_scope = false;
        self.name
            .update(cx, |input, cx| input.set_text(String::new(), cx));
        self.value.update(cx, |input, cx| input.clear_secret(cx));
    }
}

impl Render for SecretsPage {
    fn render(&mut self, _: &mut Window, cx: &mut Context<Self>) -> impl IntoElement {
        div()
            .flex()
            .flex_col()
            .gap_3()
            .child(
                div().child(primary_button("add-secret", "Add secret", self.busy).when(
                    !self.busy,
                    |button| {
                        button.on_click(cx.listener(|this, _, _, cx| {
                            this.clear_form(cx);
                            this.scope = None;
                            this.edit = Some(Edit::Add);
                            cx.notify();
                        }))
                    },
                )),
            )
            .when_some(self.error.as_ref(), |page, error| {
                page.child(note(error.clone()))
            })
            .when_some(self.edit.clone(), |page, edit| {
                page.child(self.editor(edit, cx))
            })
            .children(self.entries.iter().map(|entry| self.entry_row(entry, cx)))
            .when(self.entries.is_empty() && !self.busy, |page| {
                page.child(note("No saved secrets."))
            })
    }
}

#[cfg(test)]
mod tests;
