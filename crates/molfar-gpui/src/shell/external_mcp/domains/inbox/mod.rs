pub(in crate::shell::external_mcp) mod backend;
mod operations;

use super::super::*;
use backend::ExternalInbox;
use molfar_core::{
    external_mcp::grants::types::RESOURCE,
    inbox::{PROVIDERS, Service},
};
use std::path::Path;

pub(in crate::shell::external_mcp) const NOT_FOUND: &str = "Inbox item not found.";

impl Shell {
    pub(in crate::shell::external_mcp) fn external_inbox_target(
        &self,
        scope: &Scope,
        tool: &str,
        arguments: &Value,
    ) -> Result<Option<ReceiptTarget>, String> {
        if tool == "inbox_list" {
            if arguments["provider"]
                .as_str()
                .is_some_and(|provider| !allowed(scope, provider))
            {
                return Err(NOT_FOUND.into());
            }
            return Ok(None);
        }
        let (provider, _) = arguments["itemKey"]
            .as_str()
            .and_then(|key| key.split_once(':'))
            .filter(|(provider, key)| !key.is_empty() && allowed(scope, provider))
            .ok_or(NOT_FOUND)?;
        Ok(Some(ReceiptTarget::Resource {
            kind: RESOURCE::InboxProvider,
            id: provider.into(),
        }))
    }

    pub(in crate::shell::external_mcp) fn external_inbox_tool(
        &mut self,
        scope: &Scope,
        tool: &'static str,
        arguments: Value,
        done: Done,
        cx: &mut Context<Self>,
    ) {
        let requested = arguments["provider"].as_str().or_else(|| {
            arguments["itemKey"]
                .as_str()?
                .split_once(':')
                .map(|(provider, _)| provider)
        });
        let providers: Vec<_> = PROVIDERS
            .into_iter()
            .filter(|provider| {
                requested.is_none_or(|requested| requested == *provider) && allowed(scope, provider)
            })
            .collect();
        if providers.is_empty() {
            let result = if tool == "inbox_list" {
                operations::empty_list(&arguments)
            } else {
                Err(NOT_FOUND.into())
            };
            let _ = done.try_send(result);
            return;
        }

        let data_dir =
            match locked(&self.store).map(|store| store.data_dir().map(Path::to_path_buf)) {
                Ok(Some(path)) => path,
                _ => {
                    let _ = done.try_send(Err("Inbox is unavailable.".into()));
                    return;
                }
            };
        let service = Service {
            data_dir,
            cwd: self.workspace.project.clone().into(),
        };
        let backend: Arc<dyn ExternalInbox> = Arc::new(service);
        #[cfg(test)]
        let backend = self.external.inbox_backend.clone().unwrap_or(backend);

        let projects: Vec<_> = self
            .workspace
            .projects
            .iter()
            .filter(|project| molfar_core::remote::parse_remote_path(project).is_none())
            .map(Into::into)
            .collect();
        let cached = self
            .inbox
            .as_ref()
            .and_then(|inbox| inbox.read(cx).external_snapshot(&providers));

        cx.background_executor()
            .spawn(async move {
                let result = operations::run(
                    backend.as_ref(),
                    cached,
                    &projects,
                    &providers,
                    tool,
                    &arguments,
                );
                let _ = done.try_send(result);
            })
            .detach();
    }
}

fn allowed(scope: &Scope, provider: &str) -> bool {
    PROVIDERS.contains(&provider) && scope.principal.reaches(RESOURCE::InboxProvider, provider)
}
