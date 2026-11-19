use super::{super::*, generated_id};
use crate::familiars::external::NOT_FOUND;
use molfar_core::external_mcp::{
    grants::types::RESOURCE,
    shape::{familiars::profile, page},
    tools::{
        familiars::{Create, List, Mutation, Read, Send, Update},
        parse,
    },
};

impl Shell {
    pub(in crate::shell::external_mcp) fn external_familiar_target(
        &self,
        scope: &Scope,
        tool: &str,
        arguments: &Value,
        cx: &App,
    ) -> Result<Option<ReceiptTarget>, String> {
        if tool == "familiars_list" {
            return Ok(None);
        }
        if tool == "familiars_create" {
            let request = board_api::normalize_request_id(arguments["requestId"].as_str(), None)?;
            return Ok(Some(familiar_target(generated_id(
                &scope.principal,
                &request,
            ))));
        }

        let id = arguments["familiarId"].as_str().ok_or(NOT_FOUND)?;
        if !scope.principal.reaches(RESOURCE::Familiar, id) {
            return Err(NOT_FOUND.into());
        }

        let target = familiar_target(id.to_owned());
        if self
            .familiars
            .as_ref()
            .is_some_and(|view| view.read(cx).external_familiar(id).is_some())
        {
            return Ok(Some(target));
        }
        if tool == "familiars_delete" {
            let request = board_api::normalize_request_id(arguments["requestId"].as_str(), None)?;
            if locked(&self.store)?.external_receipt_exists(
                &target,
                &scope.principal.client_id,
                tool,
                &request,
            )? {
                return Ok(Some(target));
            }
        }
        Err(NOT_FOUND.into())
    }

    pub(in crate::shell::external_mcp) fn external_familiar_tool(
        &mut self,
        scope: &Scope,
        tool: &'static str,
        arguments: &Value,
        receipt: Option<&Receipt>,
        done: Done,
        cx: &mut Context<Self>,
    ) {
        let task = (|| {
            let familiars = self.familiars.as_ref().ok_or(NOT_FOUND)?;
            if tool == "familiars_list" {
                let input: List = parse(arguments)?;
                let allowed = familiars
                    .read(cx)
                    .external_roster()
                    .iter()
                    .filter(|familiar| scope.principal.reaches(RESOURCE::Familiar, &familiar.id));
                return Ok(gpui::Task::ready(page::list(
                    "familiars",
                    allowed.map(profile),
                    input.limit,
                    input.offset,
                )));
            }
            let Some(receipt) = receipt else {
                let input: Read = parse(arguments)?;
                return familiars.update(cx, |view, cx| view.external_read(input, cx));
            };
            let ReceiptTarget::Resource {
                kind: RESOURCE::Familiar,
                id,
            } = &receipt.target
            else {
                return Err(NOT_FOUND.into());
            };
            familiars.update(cx, |view, cx| {
                let value = match tool {
                    "familiars_create" => {
                        let input: Create = parse(arguments)?;
                        view.external_create(
                            id,
                            input.name.as_deref(),
                            input.mascot.as_deref(),
                            input.color.as_deref(),
                            cx,
                        )?
                    }
                    "familiars_update" => {
                        let input: Update = parse(arguments)?;
                        view.external_update(
                            id,
                            input.name.as_deref(),
                            input.mascot.as_deref(),
                            input.color.as_deref(),
                            cx,
                        )?
                    }
                    "familiars_send" => {
                        let input: Send = parse(arguments)?;
                        view.mobile_send(id, input.text, vec![], cx)
                            .map_err(|_| NOT_FOUND)?;
                        json!({"familiarId":id,"queued":true})
                    }
                    "familiars_reset" => {
                        view.mobile_reset(id, cx).map_err(|_| NOT_FOUND)?;
                        json!({"familiarId":id,"reset":true})
                    }
                    "familiars_delete" => {
                        let input: Mutation = parse(arguments)?;
                        if !receipt.resumed || view.external_familiar(id).is_some() {
                            view.mobile_delete(id, cx).map_err(|_| NOT_FOUND)?;
                        }
                        json!({"familiarId":input.familiar_id,"deleted":true})
                    }
                    _ => return Err("Unknown Familiars tool.".into()),
                };
                let settled = view.wait_for_external_write(cx);
                Ok(cx.spawn(async move |_, _| {
                    settled.await.map_err(|error| {
                        log::warn!("External MCP could not save Familiar changes: {error}");
                        "Familiar changes could not be saved."
                    })?;
                    Ok(value)
                }))
            })
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

fn familiar_target(id: String) -> ReceiptTarget {
    ReceiptTarget::Resource {
        kind: RESOURCE::Familiar,
        id,
    }
}
