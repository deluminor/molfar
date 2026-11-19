use super::*;
use crate::settings::{ExternalClientRow, ExternalStatus};
use molfar_core::external_mcp::{
    grants::naming::default_name,
    transport::{Audit, Authenticate, Server},
    types::ServerConfig,
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
        let store = self.store.clone();
        let audit: Audit = Arc::new(move |entry| locked(&store)?.external_audit(entry));
        let (server, calls) = match Server::start(port, authenticate, audit) {
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
            default_name: default_name(&clients),
            clients: clients
                .into_iter()
                .filter(|client| client.revoked_at.is_none())
                .map(|client| ExternalClientRow {
                    id: client.id,
                    name: client.name,
                    grants: client.grants,
                    created_at: client.created_at,
                    resources_count: client.resources.len(),
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

    pub(in crate::shell) fn external_dismiss_key(&mut self, cx: &mut Context<Self>) {
        if self.external.new_key.take().is_some() {
            self.sync_settings(cx);
        }
    }
}
