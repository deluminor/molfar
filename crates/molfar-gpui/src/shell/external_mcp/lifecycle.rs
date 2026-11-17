use super::*;
use crate::settings::{ExternalClientRow, ExternalStatus};
use molfar_core::external_mcp::{
    transport::{Authenticate, Server},
    types::{SCOPE, ServerConfig},
};
use std::sync::Arc;

impl Shell {
    pub(in crate::shell) fn init_external_mcp(&mut self, cx: &mut Context<Self>) {
        if cx.is_test() {
            return;
        }
        match locked(&self.store).and_then(|store| store.external_config()) {
            Ok(config) if config.enabled => self.external_listen(config.port, cx),
            Ok(_) => {}
            Err(error) => self.external.error = Some(format!("External MCP: {error}")),
        }
        cx.on_app_quit(|this, _| {
            this.external.server = None;
            async {}
        })
        .detach();
    }

    /// A port conflict leaves the rest of MOLFAR running and is shown in Settings.
    pub(super) fn external_listen(&mut self, port: u16, cx: &mut Context<Self>) {
        self.external.server = None;
        let store = self.store.clone();
        let authenticate: Authenticate =
            Arc::new(move |token| locked(&store)?.external_authenticate(token));
        let (server, calls) = match Server::start(port, authenticate) {
            Ok(started) => started,
            Err(error) => {
                self.external.error = Some(format!(
                    "{error}. Another app may be using this port: choose another port and turn access on again."
                ));
                return;
            }
        };
        self.external.server = Some(server);
        self.external.error = None;
        cx.spawn(async move |this, cx| {
            while let Ok(call) = calls.recv().await {
                if this
                    .update(cx, |this, cx| this.handle_external_call(call, cx))
                    .is_err()
                {
                    break;
                }
            }
        })
        .detach();
    }

    pub(in crate::shell) fn external_settings_status(&self) -> ExternalStatus {
        let loaded = locked(&self.store)
            .and_then(|store| Ok((store.external_config()?, store.external_clients()?)));
        let (config, clients) = match loaded {
            Ok(loaded) => loaded,
            Err(error) => (ServerConfig::default(), {
                log::warn!("external MCP settings unavailable: {error}");
                Vec::new()
            }),
        };
        ExternalStatus {
            enabled: config.enabled,
            port: config.port,
            endpoint: self
                .external
                .server
                .as_ref()
                .map(|server| format!("http://{}/mcp", server.address())),
            error: self.external.error.clone(),
            clients: clients
                .into_iter()
                .filter(|client| client.revoked_at.is_none())
                .map(|client| ExternalClientRow {
                    id: client.id,
                    name: client.name,
                    scopes: client.scopes,
                    projects: client.projects,
                })
                .collect(),
            new_key: self.external.new_key.clone(),
        }
    }

    pub(in crate::shell) fn external_configure(
        &mut self,
        enabled: bool,
        port: u16,
        cx: &mut Context<Self>,
    ) {
        let saved = locked(&self.store)
            .and_then(|store| store.save_external_config(&ServerConfig { enabled, port }));
        match saved {
            Err(error) => self.external.error = Some(error),
            Ok(()) if enabled => self.external_listen(port, cx),
            Ok(()) => {
                self.external.server = None;
                self.external.error = None;
            }
        }
        self.sync_settings(cx);
    }

    pub(in crate::shell) fn external_create_client(&mut self, cx: &mut Context<Self>) {
        let created = locked(&self.store).and_then(|store| {
            let count = store.external_clients()?.len();
            let name = if count == 0 {
                "OpenBot".to_owned()
            } else {
                format!("OpenBot {}", count + 1)
            };
            store.external_create_client(&name, &[SCOPE::Read], &[])
        });
        match created {
            Ok((client, token)) => self.external.new_key = Some((client.name, token)),
            Err(error) => self.external.error = Some(error),
        }
        self.sync_settings(cx);
    }

    pub(in crate::shell) fn external_toggle_grant(
        &mut self,
        id: &str,
        scope: Option<SCOPE>,
        project: Option<String>,
        cx: &mut Context<Self>,
    ) {
        let updated = locked(&self.store).and_then(|store| {
            let client = store
                .external_clients()?
                .into_iter()
                .find(|client| client.id == id)
                .ok_or("External client not found.")?;
            let mut scopes = client.scopes;
            if let Some(scope) = scope {
                toggle(&mut scopes, scope);
            }
            let mut projects = client.projects;
            if let Some(project) = project {
                toggle(&mut projects, project);
            }
            store.external_update_client(id, &scopes, &projects)
        });
        if let Err(error) = updated {
            self.external.error = Some(error);
        }
        self.sync_settings(cx);
    }

    pub(in crate::shell) fn external_revoke(&mut self, id: &str, cx: &mut Context<Self>) {
        if let Err(error) = locked(&self.store).and_then(|store| store.external_revoke_client(id)) {
            self.external.error = Some(error);
        }
        self.sync_settings(cx);
    }

    pub(in crate::shell) fn external_dismiss_key(&mut self, cx: &mut Context<Self>) {
        self.external.new_key = None;
        self.sync_settings(cx);
    }
}

fn toggle<T: PartialEq>(items: &mut Vec<T>, item: T) {
    if let Some(index) = items.iter().position(|existing| *existing == item) {
        items.remove(index);
    } else {
        items.push(item);
    }
}
