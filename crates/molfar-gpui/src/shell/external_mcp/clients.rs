#[path = "resource_picker.rs"]
mod resource_picker;
#[cfg(test)]
#[path = "resource_tests.rs"]
mod resource_tests;

use super::*;
use molfar_core::external_mcp::grants::{
    naming::default_name,
    types::{ClientUpdate, GRANT, ResourceGrant},
};

impl Shell {
    pub(in crate::shell) fn external_create_client(
        &mut self,
        name: Option<&str>,
        cx: &mut Context<Self>,
    ) -> Result<(), String> {
        let (client, token) = {
            let store = locked(&self.store)?;
            let default;
            let name = match name {
                Some(name) => name,
                None => {
                    default = default_name(&store.external_clients()?);
                    &default
                }
            };
            store.external_create_client(name, &[], &[])?
        };
        self.external.new_key = Some((client.name, token));
        self.sync_settings(cx);
        Ok(())
    }

    pub(in crate::shell) fn external_rename(
        &mut self,
        id: &str,
        name: &str,
        cx: &mut Context<Self>,
    ) -> Result<(), String> {
        let updated = {
            let store = locked(&self.store)?;
            let client = active_client(&store, id)?;
            store.external_update_client(
                id,
                ClientUpdate {
                    name: Some(name),
                    grants: &client.grants,
                    projects: &client.projects,
                    resources: &client.resources,
                },
            )?
        };
        if let Some((key_name, token)) = &mut self.external.new_key
            && token.split('_').nth(1) == Some(id)
        {
            *key_name = updated.name;
        }
        self.sync_settings(cx);
        Ok(())
    }

    pub(in crate::shell) fn external_set_projects(
        &mut self,
        id: &str,
        all: bool,
        cx: &mut Context<Self>,
    ) {
        let projects: Vec<_> = self
            .workspace
            .projects
            .iter()
            .filter(|project| all && molfar_core::remote::parse_remote_path(project).is_none())
            .cloned()
            .collect();
        let result = locked(&self.store).and_then(|store| {
            let client = active_client(&store, id)?;
            store.external_update_client(
                id,
                ClientUpdate {
                    name: None,
                    grants: &client.grants,
                    projects: &projects,
                    resources: &client.resources,
                },
            )
        });
        if let Err(error) = result {
            self.external.error = Some(error);
        }
        self.sync_settings(cx);
    }

    pub(in crate::shell) fn external_toggle_grant(
        &mut self,
        id: &str,
        grant: Option<GRANT>,
        project: Option<String>,
        cx: &mut Context<Self>,
    ) {
        let updated = locked(&self.store).and_then(|store| {
            let client = active_client(&store, id)?;
            let mut grants = client.grants;
            if let Some(grant) = grant {
                toggle(&mut grants, grant);
            }
            let mut projects = client.projects;
            if let Some(project) = project {
                let key = molfar_core::files::path_key(&project);
                if projects
                    .iter()
                    .any(|path| molfar_core::files::path_key(path) == key)
                {
                    projects.retain(|path| molfar_core::files::path_key(path) != key);
                } else if molfar_core::remote::parse_remote_path(&project).is_none() {
                    projects.push(project);
                }
            }
            store.external_update_client(
                id,
                ClientUpdate {
                    name: None,
                    grants: &grants,
                    projects: &projects,
                    resources: &client.resources,
                },
            )
        });
        if let Err(error) = updated {
            self.external.error = Some(error);
        }
        self.sync_settings(cx);
    }

    pub(in crate::shell) fn external_toggle_resource(
        &mut self,
        id: &str,
        resource: ResourceGrant,
        cx: &mut Context<Self>,
    ) -> Result<(), String> {
        let available = self
            .external_resources(cx)
            .iter()
            .any(|option| option.grant == resource);
        let result = locked(&self.store).and_then(|store| {
            let client = active_client(&store, id)?;
            let mut resources = client.resources;
            if !available && !resources.contains(&resource) {
                return Err("External resource not found.".into());
            }
            toggle(&mut resources, resource);
            store.external_update_client(
                id,
                ClientUpdate {
                    name: None,
                    grants: &client.grants,
                    projects: &client.projects,
                    resources: &resources,
                },
            )?;
            Ok(())
        });
        if let Err(error) = &result {
            self.external.error = Some(error.clone());
        }
        self.sync_settings(cx);
        result
    }

    pub(in crate::shell) fn external_revoke(&mut self, id: &str, cx: &mut Context<Self>) {
        if let Err(error) = locked(&self.store).and_then(|store| store.external_revoke_client(id)) {
            self.external.error = Some(error);
        } else if self
            .external
            .new_key
            .as_ref()
            .is_some_and(|(_, token)| token.split('_').nth(1) == Some(id))
        {
            self.external.new_key = None;
        }
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

fn active_client(
    store: &molfar_core::store::Store,
    id: &str,
) -> Result<molfar_core::external_mcp::types::Client, String> {
    store
        .external_clients()?
        .into_iter()
        .find(|client| client.id == id && client.revoked_at.is_none())
        .ok_or_else(|| "External client not found.".into())
}
