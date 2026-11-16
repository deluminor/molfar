use super::*;
mod preparation;
use molfar_core::{agent::Settings, app_access as app, catalog::Model};
use preparation::*;

impl Shell {
    pub(super) fn companion_launch_job(&mut self, job: Job, cx: &mut Context<Self>) {
        let prepared = (|| {
            let project = required(&job.input, "project")?;
            if !self.workspace.projects.contains(&project) {
                return Err("Choose one of the projects on the rail".to_string());
            }
            let choice = self.new_chat_choice(&project);
            let mut profiles = Vec::new();
            for kind in Kind::ALL {
                if !self
                    .workspace
                    .preferences
                    .hidden_for(&project)
                    .iter()
                    .any(|id| id == kind.id())
                {
                    let account = crate::accounts::get(cx)
                        .map(|center| center.read(cx).selected(kind, &project))
                        .unwrap_or_default();
                    profiles.push((kind, account));
                }
            }
            let requested_kind = job.input["harness"]
                .as_str()
                .and_then(Kind::parse)
                .unwrap_or(choice.kind);
            let effort = crate::conversation::preferred_effort(requested_kind.id(), cx);
            Ok((
                project,
                choice,
                profiles,
                crate::conversation::default_access(cx),
                effort,
            ))
        })();
        let (project, choice, profiles, access, effort) = match prepared {
            Ok(prepared) => prepared,
            Err(error) => {
                let _ = job.reply.send(json!({"ok":false,"error":error}));
                return;
            }
        };
        let store = self.store.clone();
        let cleanup_store = store.clone();
        let permit = job.permit.clone();
        let check = permit.clone();
        let work = cx.background_executor().spawn(async move {
            if job.action == "session.options" {
                let catalog = app::models_catalog(profiles)?;
                return Ok((options(&project, &choice, access, &catalog), None));
            }
            let text = message_text(&job.input)?;
            let kind = match job.input.get("harness") {
                Some(value) => value
                    .as_str()
                    .and_then(Kind::parse)
                    .ok_or("Choose an installed provider")?,
                None => choice.kind,
            };
            let account = profiles
                .into_iter()
                .find(|(candidate, _)| *candidate == kind)
                .map(|(_, account)| account)
                .ok_or("This provider is hidden for the project")?;
            if molfar_core::provider::resolve(kind).is_none() {
                return Err("Choose an installed provider".to_string());
            }
            let models = molfar_core::catalog::models_for(kind, &account)?;
            let configured = locked(&store)?
                .desktop_preferences()
                .and_then(|prefs| prefs.session_defaults(kind.id(), &project));
            let mut settings = session_loading::new_session_settings(
                configured,
                (kind == choice.kind).then_some(choice.model).flatten(),
            );
            settings.account = account;
            settings.access = access;
            if effort.is_some() {
                settings.effort = effort;
            }
            let (summary, settings) = prepare(
                &store,
                &project,
                kind,
                &job.input,
                settings,
                &models,
                || check.check(),
            )?;
            let body = json!({"sessionId":summary.id.to_string()});
            Ok((
                body,
                Some(Prepared {
                    summary,
                    settings,
                    text,
                    owned_checkout: job.input["workspaceMode"] == "worktree",
                }),
            ))
        });
        let reply = job.reply;
        cx.spawn(async move |this, cx| {
            let result = match work.await {
                Ok((value, launch)) => {
                    if let Err(error) = permit.check() {
                        let cleanup = cancel_launch(cleanup_store.clone(), launch, cx).await;
                        Err(cleanup.err().map_or(error.clone(), |cleanup| {
                            format!("{error}; cleanup failed: {cleanup}")
                        }))
                    } else {
                        let recovery = launch.clone();
                        let applied = this.update(cx, |this, cx| {
                            if let Some(Prepared {
                                summary,
                                settings,
                                text,
                                ..
                            }) = launch
                            {
                                let id = summary.id;
                                this.add(summary, cx);
                                let view = this
                                    .ensure_session(id, cx)
                                    .ok_or("Session is unavailable")?;
                                view.update(cx, |view, cx| {
                                    view.seed_new_settings(settings, cx);
                                    view.mobile_submit(text, Vec::new(), cx);
                                });
                            }
                            Ok::<_, String>(value)
                        });
                        match applied {
                            Ok(result) => result,
                            Err(_) => {
                                let error = "MOLFAR's main window is unavailable".to_string();
                                let cleanup =
                                    cancel_launch(cleanup_store.clone(), recovery, cx).await;
                                Err(cleanup.err().map_or(error.clone(), |cleanup| {
                                    format!("{error}; cleanup failed: {cleanup}")
                                }))
                            }
                        }
                    }
                }
                Err(error) => Err(error),
            };
            let response = match result {
                Ok(value) => json!({"ok":true,"result":value}),
                Err(error) => json!({"ok":false,"error":error}),
            };
            let _ = reply.send(response);
        })
        .detach();
    }
}

#[derive(Clone)]
struct Prepared {
    summary: Session,
    settings: Settings,
    text: String,
    owned_checkout: bool,
}

async fn cancel_launch(
    store: Database,
    launch: Option<Prepared>,
    cx: &gpui::AsyncApp,
) -> Result<(), String> {
    cx.background_executor()
        .spawn(async move {
            if let Some(launch) = launch {
                rollback(
                    &store,
                    &launch.summary,
                    &launch.settings,
                    launch.owned_checkout,
                )?;
            }
            Ok(())
        })
        .await
}

fn options(
    project: &str,
    choice: &super::super::new_chat_choice::NewChatChoice,
    access: AccessMode,
    catalog: &Value,
) -> Value {
    let harnesses: Vec<Value> = catalog["harnesses"].as_array().into_iter().flatten()
        .filter(|harness| harness["available"] == true)
        .map(|harness| {
            let kind = harness["id"].as_str().and_then(Kind::parse);
            let models: Vec<Value> = harness["models"].as_array().into_iter().flatten().map(|model| {
                let mut result = json!({"id":model["id"],"name":model["name"]});
                if let Some(effort) = model["settings"].as_array().into_iter().flatten().find(|setting| matches!(setting["id"].as_str(),Some("effort"|"reasoning"|"reasoningEffort"|"reasoning_effort"|"variant"))) {
                    result["effort"] = json!({"value":effort["defaultValue"],"options":effort["options"]});
                }
                result
            }).collect();
            json!({"id":harness["id"],"label":kind.map(Kind::label).unwrap_or("Provider"),"models":models})
        }).collect();
    let selected = harnesses
        .iter()
        .find(|h| h["id"] == choice.kind.id())
        .or(harnesses.first());
    let provider = selected
        .and_then(|h| h["id"].as_str())
        .unwrap_or(choice.kind.id());
    let preferred = catalog["harnesses"]
        .as_array()
        .into_iter()
        .flatten()
        .find(|harness| harness["id"] == provider)
        .and_then(|harness| harness["models"].as_array())
        .and_then(|models| models.iter().find(|model| model["isDefault"] == true))
        .and_then(|model| model["id"].as_str());
    let model = selected
        .and_then(|h| h["models"].as_array())
        .and_then(|models| {
            models
                .iter()
                .find(|m| m["id"].as_str() == choice.model.as_deref())
                .or_else(|| {
                    models
                        .iter()
                        .find(|model| model["id"].as_str() == preferred)
                })
                .or(models.first())
        })
        .map(|m| m["id"].clone())
        .unwrap_or(json!(""));
    json!({"project":project,"defaults":{"harness":provider,"model":model,"runtimeMode":access.id()},"harnesses":harnesses})
}

#[cfg(test)]
mod tests;
