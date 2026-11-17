use super::*;
use molfar_core::{
    app_access as app,
    external_mcp::tools::{
        SessionsList, SessionsRead, SessionsSend, SessionsStart, SessionsStop, parse,
    },
};

impl Shell {
    pub(super) fn external_session_tool(
        &mut self,
        scope: &Scope,
        tool: &'static str,
        arguments: Value,
        receipt: Option<&(String, String)>,
        done: Done,
        cx: &mut Context<Self>,
    ) {
        let result = match tool {
            "sessions_list" => self.external_sessions_list(scope, &arguments, cx),
            "sessions_read" => return self.external_sessions_read(scope, &arguments, done, cx),
            "sessions_start" => {
                let Some((request, digest)) = receipt.cloned() else {
                    let _ = done.try_send(Err("sessions_start requires requestId.".into()));
                    return;
                };
                return self.external_sessions_start(scope, &arguments, request, digest, done, cx);
            }
            "sessions_send" => self.external_sessions_send(scope, &arguments, cx),
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
        request: String,
        digest: String,
        done: Done,
        cx: &mut Context<Self>,
    ) {
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
            if fresh {
                store.title(summary.id, &title)?;
                summary.title = title;
                store.configure_agent(summary.id, kind.id(), &settings)?;
                store.prepare_app_prompt(summary.id, &request, &prompt)?;
                summary.has_messages = true;
            }
            Ok::<_, String>((summary, settings, fresh))
        });
        cx.spawn(async move |this, cx| {
            let result = work.await.and_then(|(summary, settings, fresh)| {
                let value = json!({"sessionId":summary.id,"project":project,"harness":kind.id(),"model":settings.model,"accepted":true});
                this.update(cx, |this, cx| {
                    if fresh {
                        let id = summary.id;
                        this.draft_sessions.insert(id);
                        this.sidebar_hidden_sessions.remove(&id);
                        this.session_worktrees.insert(id, settings.worktree_cwd.clone());
                        this.add(summary, cx);
                        if let Some(view) = this.sessions.get(&id) {
                            view.update(cx, |view, cx| view.install_app_launch(settings, true, cx));
                        }
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

    fn external_sessions_send(
        &mut self,
        scope: &Scope,
        arguments: &Value,
        cx: &mut Context<Self>,
    ) -> Result<Value, String> {
        let request: SessionsSend = parse(arguments)?;
        let id = self.external_target(scope, &request.session_id, true, cx)?;
        let prompt = app::prompt(&json!({"prompt":request.prompt}))?;
        let view = self.ensure_session(id, cx).ok_or("Session not found.")?;
        view.update(cx, |view, cx| view.load(cx));
        if !view.read(cx).ready_for_external(cx) || view.read(cx).has_saved_draft() {
            return Err("Session is busy, loading, waiting for input or has an unsent draft; nothing was sent.".into());
        }

        view.update(cx, |view, cx| {
            view.install_transfer(view.settings.clone(), Some(prompt), cx)
        });
        Ok(json!({"sessionId":id,"submitted":true}))
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
