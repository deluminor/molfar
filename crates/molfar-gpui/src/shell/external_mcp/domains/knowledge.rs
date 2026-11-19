use super::super::*;
use molfar_core::{
    external_mcp::{
        grants::types::RESOURCE,
        resources::vault_resource_id,
        tools::{
            knowledge::{Toggle, Write},
            parse,
        },
    },
    knowledge::{
        ConnectionState, VaultConnection,
        external::{NoteEdit, VAULT_NOT_FOUND},
    },
};

impl Shell {
    pub(in crate::shell::external_mcp) fn external_vault_target(
        &self,
        scope: &Scope,
        cx: &App,
    ) -> Result<ReceiptTarget, String> {
        self.external_vault(scope, cx).map(|(_, _, target)| target)
    }

    fn external_vault(
        &self,
        scope: &Scope,
        cx: &App,
    ) -> Result<
        (
            Entity<crate::knowledge::VaultService>,
            VaultConnection,
            ReceiptTarget,
        ),
        String,
    > {
        let vault = self.vault.clone().ok_or(VAULT_NOT_FOUND)?;
        let ConnectionState::Ready(connection) = vault.read(cx).state() else {
            return Err(VAULT_NOT_FOUND.into());
        };
        let id = vault_resource_id(&connection.root);
        if !scope.principal.reaches(RESOURCE::Vault, &id) {
            return Err(VAULT_NOT_FOUND.into());
        }

        let target = ReceiptTarget::Resource {
            kind: RESOURCE::Vault,
            id,
        };
        Ok((vault, connection.clone(), target))
    }

    pub(in crate::shell::external_mcp) fn external_knowledge_tool(
        &mut self,
        scope: &Scope,
        tool: &str,
        arguments: &Value,
        receipt: Option<&Receipt>,
        done: Done,
        cx: &mut Context<Self>,
    ) {
        let task = (|| {
            let (vault, connection, target) = self.external_vault(scope, cx)?;
            let Some(receipt) = receipt else {
                return vault.update(cx, |vault, cx| {
                    vault.external_knowledge_read(connection, tool, arguments, cx)
                });
            };
            if receipt.target != target {
                return Err(VAULT_NOT_FOUND.into());
            }
            let (path, expected, edit) = if tool == "knowledge_write" {
                let input: Write = parse(arguments)?;
                (
                    input.path,
                    input.expected,
                    NoteEdit::Replace {
                        body: input.body,
                        resumed: receipt.resumed,
                    },
                )
            } else {
                let input: Toggle = parse(arguments)?;
                (
                    input.path,
                    input.expected,
                    NoteEdit::Toggle {
                        ordinal: input.ordinal,
                    },
                )
            };
            Ok(vault.update(cx, |vault, cx| {
                vault.external_knowledge_edit(connection, path, expected, edit, cx)
            }))
        })();
        cx.spawn(async move |_, _| {
            let result = match task {
                Ok(task) => task.await,
                Err(error) => Err(error),
            };
            let _ = done.try_send(result);
        })
        .detach();
    }
}
