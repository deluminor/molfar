use super::*;
use crate::settings::ExternalResource;
use molfar_core::{
    external_mcp::{
        grants::types::{RESOURCE, ResourceGrant},
        resources::vault_resource_id,
    },
    inbox::{PROVIDERS, provider_label},
    knowledge::ConnectionState,
};

impl Shell {
    pub(in crate::shell) fn external_resources(&self, cx: &App) -> Vec<ExternalResource> {
        let mut resources = Vec::new();
        if let Some(vault) = &self.vault
            && let ConnectionState::Ready(connection) = vault.read(cx).state()
        {
            resources.push(ExternalResource {
                grant: ResourceGrant {
                    kind: RESOURCE::Vault,
                    id: vault_resource_id(&connection.root),
                },
                label: connection.name.clone(),
                connected: None,
            });
        }
        let connections = self
            .inbox
            .as_ref()
            .map(|inbox| inbox.read(cx).connection_statuses())
            .unwrap_or_default();
        resources.extend(PROVIDERS.into_iter().map(|provider| {
            ExternalResource {
                grant: ResourceGrant {
                    kind: RESOURCE::InboxProvider,
                    id: provider.into(),
                },
                label: provider_label(provider).into(),
                connected: Some(
                    connections
                        .get(provider)
                        .is_some_and(|(connected, _)| *connected),
                ),
            }
        }));
        if let Some(familiars) = &self.familiars {
            resources.extend(familiars.read(cx).external_roster().iter().map(|familiar| {
                ExternalResource {
                    grant: ResourceGrant {
                        kind: RESOURCE::Familiar,
                        id: familiar.id.clone(),
                    },
                    label: familiar.label(),
                    connected: None,
                }
            }));
        }
        resources
    }
}
