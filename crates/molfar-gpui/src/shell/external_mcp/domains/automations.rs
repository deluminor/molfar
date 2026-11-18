use super::{super::*, generated_id};
use molfar_core::{
    automations::{AutomationUpsert, DueAutomationRun, Service},
    external_mcp::{
        automations::{apply, in_projects},
        shape::{automations as shape, page},
        tools::{
            automations::{List, Mutation, Read, Runs, SetEnabled, Upsert},
            parse,
        },
    },
};

const NOT_FOUND: &str = "Automation not found.";

impl Shell {
    pub(in crate::shell::external_mcp) fn external_automation_target(
        &self,
        scope: &Scope,
        tool: &str,
        arguments: &Value,
    ) -> Result<Option<ReceiptTarget>, String> {
        if tool == "automations_list" {
            if let Some(project) = arguments["project"].as_str() {
                scope.project(project).map_err(|_| NOT_FOUND)?;
            }
            return Ok(None);
        }

        if let Some(project) = arguments["project"].as_str() {
            return scope
                .project(project)
                .map(project_target)
                .map(Some)
                .map_err(|_| NOT_FOUND.into());
        }
        let id = arguments["automationId"].as_str().ok_or(NOT_FOUND)?;
        let service = self.automation_state.service.as_ref().ok_or(NOT_FOUND)?;
        let current = service
            .lock()
            .map_err(|_| NOT_FOUND)?
            .read(id)
            .map_err(|_| NOT_FOUND)?;
        if let Some(automation) = current {
            return scope
                .project(&automation.cwd)
                .map(project_target)
                .map(Some)
                .map_err(|_| NOT_FOUND.into());
        }
        if tool == "automations_delete" {
            let request = board_api::normalize_request_id(arguments["requestId"].as_str(), None)?;
            let store = locked(&self.store)?;
            for project in &scope.projects {
                let target = project_target(project.clone());
                if store.external_receipt_exists(
                    &target,
                    &scope.principal.client_id,
                    tool,
                    &request,
                )? {
                    return Ok(Some(target));
                }
            }
        }
        Err(NOT_FOUND.into())
    }

    pub(in crate::shell::external_mcp) fn external_automation_tool(
        &mut self,
        scope: &Scope,
        tool: &'static str,
        arguments: Value,
        receipt: Option<&Receipt>,
        done: Done,
        cx: &mut Context<Self>,
    ) {
        let Some(service) = self.automation_state.service.clone() else {
            self.initialize_automations(cx);
            let _ = done.try_send(Err("Automations are unavailable.".into()));
            return;
        };
        let projects = scope.projects.clone();
        let receipt = receipt.cloned();
        let draft = receipt.as_ref().and_then(|receipt| {
            if tool != "automations_upsert" || arguments["automationId"].is_string() {
                return None;
            }
            let project = scope.project(arguments["project"].as_str()?).ok()?;
            let mut draft = crate::automations::new_draft(&project, cx);
            draft.id = generated_id(&scope.principal, &receipt.request);
            Some(draft)
        });
        let mutated = receipt.is_some();
        let work = cx.background_executor().spawn(async move {
            let mut service = service.lock().map_err(|_| "Automations are unavailable.")?;
            run(
                &mut service,
                &projects,
                tool,
                &arguments,
                receipt.as_ref(),
                draft,
            )
        });
        cx.spawn(async move |this, cx| {
            let result = work.await;
            let result = match result {
                Ok((value, launch)) => {
                    let _ = this.update(cx, |this, cx| {
                        if let Some(launch) = launch {
                            this.launch_automation(launch, false, cx);
                        }
                        if mutated && let Some(view) = &this.automations {
                            view.update(cx, |view, cx| view.refresh(cx));
                        }
                    });
                    Ok(value)
                }
                Err(error) => Err(error),
            };
            let _ = done.try_send(result);
        })
        .detach();
    }
}

fn project_target(project: String) -> ReceiptTarget {
    ReceiptTarget::Project(molfar_core::files::path_key(&project))
}

fn run(
    service: &mut Service,
    projects: &[String],
    tool: &str,
    arguments: &Value,
    receipt: Option<&Receipt>,
    draft: Option<AutomationUpsert>,
) -> Result<(Value, Option<DueAutomationRun>), String> {
    if tool == "automations_list" {
        let input: List = parse(arguments)?;
        let projects = input
            .project
            .as_ref()
            .map_or_else(|| projects.to_vec(), |project| vec![project.clone()]);
        let automations = service.list()?;
        let page = page::list(
            "automations",
            automations
                .iter()
                .filter(|automation| in_projects(automation, &projects))
                .map(shape::summary),
            input.limit,
            input.offset,
        )?;
        return Ok((page, None));
    }

    let current = if let Some(id) = arguments["automationId"].as_str() {
        let current = service.read(id)?;
        if let Some(automation) = &current {
            if !in_projects(automation, projects)
                || receipt
                    .is_some_and(|receipt| receipt.target != project_target(automation.cwd.clone()))
            {
                return Err(NOT_FOUND.into());
            }
        } else if tool != "automations_delete" || !receipt.is_some_and(|receipt| receipt.resumed) {
            return Err(NOT_FOUND.into());
        }
        current
    } else {
        None
    };
    let now = molfar_core::time::now_ms().min(i64::MAX as u64) as i64;
    let value = match tool {
        "automations_read" => {
            let input: Read = parse(arguments)?;
            shape::detail(
                &current.ok_or(NOT_FOUND)?,
                input.max_chars,
                input.char_offset,
            )?
        }
        "automations_runs" => {
            let input: Runs = parse(arguments)?;
            let runs = service.runs(&input.automation_id)?;
            page::list(
                "runs",
                runs.iter().map(shape::run),
                input.limit,
                input.offset,
            )?
        }
        "automations_set_enabled" => {
            let input: SetEnabled = parse(arguments)?;
            let automation = service.set_enabled(&input.automation_id, input.enabled)?;
            json!({"automationId":automation.id, "enabled":automation.enabled})
        }
        "automations_upsert" => {
            let input: Upsert = parse(arguments)?;
            let draft = current
                .as_ref()
                .map(AutomationUpsert::from_automation)
                .or(draft)
                .ok_or(NOT_FOUND)?;
            if input.automation_id.is_none()
                && let Some(existing) = service.read(&draft.id)?
            {
                if project_target(existing.cwd) != project_target(draft.cwd) {
                    return Err(NOT_FOUND.into());
                }
                return Ok((json!({"automationId":existing.id}), None));
            }
            let saved = service.upsert(apply(draft, input, now)?)?;
            json!({"automationId":saved.id})
        }
        "automations_run_now" => {
            let automation = current.ok_or(NOT_FOUND)?;
            let run = service.run_now(&automation.id, now)?;
            return Ok((shape::run(&run), Some(DueAutomationRun { automation, run })));
        }
        "automations_delete" => {
            let input: Mutation = parse(arguments)?;
            service.delete(&input.automation_id)?;
            json!({"automationId":input.automation_id,"deleted":true})
        }
        _ => return Err("Unknown automations tool.".into()),
    };
    Ok((value, None))
}
