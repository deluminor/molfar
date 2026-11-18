use super::*;
use molfar_core::{
    app_access as app,
    external_mcp::tools::{
        parse,
        sessions::{SessionsList, SessionsRead, SessionsSend, SessionsStart, SessionsStop},
    },
    store::PROMPT,
};

impl Shell {
    pub(super) fn external_session_tool(
        &mut self,
        scope: &Scope,
        tool: &'static str,
        arguments: Value,
        receipt: Option<&Receipt>,
        done: Done,
        cx: &mut Context<Self>,
    ) {
        let result = match tool {
            "sessions_list" => self.external_sessions_list(scope, &arguments, cx),
            "sessions_read" => return self.external_sessions_read(scope, &arguments, done, cx),
            "sessions_start" | "sessions_send" => {
                let Some(receipt) = receipt.cloned() else {
                    let _ = done.try_send(Err(format!("{tool} requires requestId.")));
                    return;
                };
                if tool == "sessions_start" {
                    return self.external_sessions_start(scope, &arguments, receipt, done, cx);
                }
                self.external_sessions_send(scope, &arguments, &receipt.request, cx)
            }
            "sessions_stop" => self.external_sessions_stop(scope, &arguments, cx),
            _ => Err("Unknown MOLFAR tool.".into()),
        };
        let _ = done.try_send(result);
    }

    fn external_sessions_list(
        &self,
        scope: &Scope,
        arguments: &Value,
        cx: &App,
    ) -> Result<Value, String> {
        let request: SessionsList = parse(arguments)?;
        let project = scope.project(&request.project)?;
        let limit = request.limit.unwrap_or(30);
        if !(1..=100).contains(&limit) {
            return Err("limit must be from 1 to 100.".into());
        }
        let offset = request.offset.unwrap_or(0) as usize;
        let rows: Vec<Value> = self
            .order
            .iter()
            .filter(|id| self.external_reachable(**id, &scope.projects, cx))
            .filter(|id| {
                molfar_core::files::path_key(&self.session_metadata(**id, cx).summary.cwd)
                    == molfar_core::files::path_key(&project)
            })
            .map(|id| {
                let metadata = self.session_metadata(*id, cx);
                json!({"sessionId":id,"title":metadata.summary.title,"harness":metadata.summary.provider,"status":self.external_session_status(*id, cx),"archived":metadata.summary.archived})
            })
            .collect();
        let page: Vec<_> = rows
            .iter()
            .skip(offset)
            .take(limit as usize)
            .cloned()
            .collect();
        let next = offset + page.len();

        Ok(
            json!({"project":project,"sessions":page,"nextOffset":(next < rows.len()).then_some(next)}),
        )
    }

    fn external_sessions_read(
        &mut self,
        scope: &Scope,
        arguments: &Value,
        done: Done,
        cx: &mut Context<Self>,
    ) {
        let target = parse::<SessionsRead>(arguments)
            .and_then(|request| self.external_target(scope, &request.session_id, false, cx));
        let id = match target {
            Ok(id) => id,
            Err(error) => {
                let _ = done.try_send(Err(error));
                return;
            }
        };
        let _ = self.ensure_session(id, cx);
        let status = self.external_session_status(id, cx);
        let busy = self.session_metadata(id, cx).busy;
        let draft = self
            .sessions
            .get(&id)
            .is_some_and(|view| view.read(cx).has_saved_draft())
            || self.draft_sessions.contains(&id);
        let mut page = arguments.clone();
        if let Some(object) = page.as_object_mut() {
            object.remove("sessionId");
        }
        let store = self.store.clone();
        let work = cx.background_executor().spawn(async move {
            let mut value = locked(&store)?.app_conversation(id, &page, busy, draft)?;
            value["status"] = json!(status);
            if status == "needs-input" {
                value["guidance"] = json!("This session is waiting for an approval or answer. Resolve it in MOLFAR; this connection cannot approve it.");
            }
            Ok(value)
        });
        cx.spawn(async move |_, _| {
            let _ = done.send(work.await).await;
        })
        .detach();
    }

    fn external_sessions_start(
        &mut self,
        scope: &Scope,
        arguments: &Value,
        receipt: Receipt,
        done: Done,
        cx: &mut Context<Self>,
    ) {
        let Receipt {
            request, digest, ..
        } = receipt;
        let parsed = parse::<SessionsStart>(arguments).and_then(|input| {
            let project = scope.project(&input.project)?;
            let prompt = app::prompt(&json!({"prompt":input.prompt}))?;
            let title = input
                .title
                .map(|title| title.trim().chars().take(160).collect::<String>())
                .filter(|title| !title.is_empty())
                .unwrap_or_else(|| prompt.chars().take(160).collect());
            Ok((project, prompt, title))
        });
        let (project, prompt, title) = match parsed {
            Ok(parsed) => parsed,
            Err(error) => {
                let _ = done.try_send(Err(error));
                return;
            }
        };
        let defaults = super::super::session_loading::NewSessionDefaults::read(
            self.new_chat_choice(&project),
            &project,
            cx,
        );
        let kind = defaults.kind();
        let owner = scope.owner();
        let store = self.store.clone();
        let cwd = project.clone();
        let work = cx.background_executor().spawn(async move {
            let store = locked(&store)?;
            let settings = defaults.settings(&store, &cwd);
            let mut settings = app::launch_settings(&json!({}), kind.id(), settings, kind, &[])?;
            settings.revision = 0;
            let (mut summary, fresh) =
                store.create_app_session(&owner, &request, &digest, kind.id(), &cwd)?;
            // A start interrupted before its provider accepted the prompt
            // resumes that one prompt; a delivered or queued one never relaunches.
            let launch = match store.app_prompt_state(summary.id, &request)? {
                PROMPT::Missing => {
                    store.title(summary.id, &title)?;
                    summary.title = title;
                    store.configure_agent(summary.id, kind.id(), &settings)?;
                    store.prepare_app_prompt(summary.id, &request, &prompt)?;
                    summary.has_messages = true;
                    true
                }
                PROMPT::Draft => {
                    if let Some(saved) = store.agent_settings(summary.id)? {
                        settings = saved;
                    }
                    true
                }
                PROMPT::Queued | PROMPT::Delivered => false,
            };
            Ok::<_, String>((summary, settings, fresh, launch))
        });
        cx.spawn(async move |this, cx| {
            let result = work.await.and_then(|(summary, settings, fresh, launch)| {
                let value = json!({"sessionId":summary.id,"project":project,"harness":kind.id(),"model":settings.model,"accepted":true});
                this.update(cx, |this, cx| {
                    let id = summary.id;
                    if fresh {
                        this.draft_sessions.insert(id);
                        this.sidebar_hidden_sessions.remove(&id);
                        this.session_worktrees.insert(id, settings.worktree_cwd.clone());
                        this.add(summary, cx);
                    }
                    if launch && let Some(view) = this.ensure_session(id, cx) {
                        view.update(cx, |view, cx| view.install_queued_app_launch(settings, cx));
                        this.invalidate_chrome(cx);
                        cx.notify();
                    }
                })
                .map_err(|_| "MOLFAR closed before the session started.".to_owned())?;
                Ok(value)
            });
            let _ = done.send(result).await;
        })
        .detach();
    }

    /// The prompt is reserved under a per-client request identity before it is
    /// handed to the session, so a retry after an interruption resumes that
    /// one prompt instead of sending a second turn.
    fn external_sessions_send(
        &mut self,
        scope: &Scope,
        arguments: &Value,
        request: &str,
        cx: &mut Context<Self>,
    ) -> Result<Value, String> {
        let input: SessionsSend = parse(arguments)?;
        let id = self.external_target(scope, &input.session_id, true, cx)?;
        let prompt = app::prompt(&json!({"prompt":input.prompt}))?;
        let view = self.ensure_session(id, cx).ok_or("Session not found.")?;
        let key = format!("{}:{request}", scope.owner());
        let accepted = json!({"sessionId":id,"submitted":true});
        let state = locked(&self.store)?.app_prompt_state(id, &key)?;
        match state {
            PROMPT::Delivered | PROMPT::Queued => return Ok(accepted),
            PROMPT::Draft => {
                view.update(cx, |view, cx| {
                    view.install_queued_app_launch(view.settings.clone(), cx)
                });
                return Ok(accepted);
            }
            PROMPT::Missing => {}
        }

        view.update(cx, |view, cx| view.load(cx));
        let blocked = {
            let view = view.read(cx);
            !view.ready_for_external(cx) || view.has_saved_draft() || view.needs_approval()
        };
        if blocked {
            return Err("Session is busy, loading, waiting for an approval or answer, or has an unsent draft; nothing was sent.".into());
        }

        {
            let store = locked(&self.store)?;
            store.prepare_app_prompt(id, &key, &prompt)?;
            // Never hand the session a draft other than this prompt.
            if store.app_prompt_state(id, &key)? != PROMPT::Draft {
                return Err("Session has an unsent draft; nothing was sent.".into());
            }
        }
        view.update(cx, |view, cx| {
            view.install_queued_app_launch(view.settings.clone(), cx)
        });
        Ok(accepted)
    }

    fn external_sessions_stop(
        &mut self,
        scope: &Scope,
        arguments: &Value,
        cx: &mut Context<Self>,
    ) -> Result<Value, String> {
        let request: SessionsStop = parse(arguments)?;
        let id = self.external_target(scope, &request.session_id, true, cx)?;
        let view = self.ensure_session(id, cx).ok_or("Session not found.")?;
        let running = view.read(cx).busy;
        if running {
            view.update(cx, |view, cx| view.stop_app_session(cx));
        }
        Ok(json!({"sessionId":id,"stopped":running,"alreadyIdle":!running}))
    }
}
