use std::{collections::HashMap, path::PathBuf};

use gpui::{App, Context, Task};
use molfar_core::{
    familiar::bridge::Call,
    secrets::{
        Scope, SecretStore,
        run::{self, Cancellation, Outcome},
    },
};
use serde_json::Value;

use crate::{
    conversation::Conversation,
    runtime::{Database, locked},
};

#[derive(Default)]
pub(crate) struct SessionRuns(Cancellation);

impl SessionRuns {
    pub(crate) fn child(&self) -> Cancellation {
        self.0.child()
    }

    pub(crate) fn stop(&mut self) {
        self.0.cancel();
        self.0 = Cancellation::default();
    }
}

impl Drop for SessionRuns {
    fn drop(&mut self) {
        self.0.cancel();
    }
}

#[derive(Default)]
pub(crate) struct Runs(HashMap<(i64, String), ActiveRun>);

struct ActiveRun {
    call: Call,
    cancel: Cancellation,
}

impl Drop for ActiveRun {
    fn drop(&mut self) {
        self.cancel.cancel();
    }
}

impl Runs {
    pub(crate) fn reattach(&mut self, call: &Call) -> bool {
        if call.action != run::ACTION {
            return false;
        }
        let Some(active) = self.0.get_mut(&(call.session, call.request_id.clone())) else {
            return false;
        };
        if active.call.input == call.input {
            active.call.reply = call.reply.clone();
        } else {
            let _ = call.reply.send(Err(
                "Request ID was already used with different input".into()
            ));
        }
        true
    }

    pub(crate) fn start(
        &mut self,
        call: Call,
        cancel: Cancellation,
        target: Target,
        cx: &App,
    ) -> Task<Result<Outcome, String>> {
        let input = call.input.clone();
        self.0.insert(
            (call.session, call.request_id.clone()),
            ActiveRun {
                call,
                cancel: cancel.clone(),
            },
        );
        cx.background_executor()
            .spawn(async move { target.execute(input, &cancel) })
    }

    pub(crate) fn finish(&mut self, session: i64, id: &str) -> Option<Call> {
        self.0.remove(&(session, id.to_owned())).map(|active| Call {
            session,
            request_id: id.to_owned(),
            action: run::ACTION.to_owned(),
            input: active.call.input.clone(),
            reply: active.call.reply.clone(),
        })
    }

    pub(crate) fn stop(&self, session: i64) {
        for ((owner, _), active) in &self.0 {
            if *owner == session {
                active.cancel.cancel();
            }
        }
    }

    pub(crate) fn stop_all(&self) {
        for active in self.0.values() {
            active.cancel.cancel();
        }
    }
}

pub(crate) struct Target {
    pub(crate) db: Database,
    pub(crate) store: SecretStore,
    pub(crate) project: Option<String>,
    pub(crate) scope: Option<Scope>,
    pub(crate) roots: Vec<PathBuf>,
}

impl Target {
    fn execute(self, input: Value, cancel: &Cancellation) -> Result<Outcome, String> {
        let request = run::Request::parse(&input)?;
        let prepared = {
            let db = locked(&self.db)?;
            let scope = match self.project {
                Some(project) => {
                    super::secret_requests::own_scope(&self.store, &db, &project, None)?
                }
                None => self.scope,
            };
            run::prepare(&self.store, &db, scope, &self.roots, request)?
        };
        prepared.execute(cancel)
    }
}

pub(crate) fn settle(
    call: &Call,
    result: Result<Outcome, String>,
) -> (Result<Value, String>, Result<Value, String>) {
    match result {
        Ok(outcome) => {
            log::info!(target: "molfar::app_run", "{}", audit(call.session, &outcome));
            let receipt = outcome.receipt();
            (
                serde_json::to_value(outcome)
                    .map_err(|_| "Could not encode app run result.".into()),
                Ok(receipt),
            )
        }
        Err(error) => (Err(error.clone()), Err(error)),
    }
}

fn audit(session: i64, outcome: &Outcome) -> Value {
    serde_json::json!({
        "session":session, "secrets":outcome.secrets, "exitCode":outcome.exit_code,
        "timedOut":outcome.timed_out, "durationMs":outcome.duration_ms,
    })
}

impl super::Shell {
    pub(super) fn dispatch_run(&mut self, call: Call, cx: &mut Context<Self>) {
        let session = call.session;
        let id = call.request_id.clone();
        let caller = self.sessions[&session].read(cx);
        let target = match self.run_target(caller) {
            Ok(target) => target,
            Err(error) => return self.finish_app_call(call, Err(error), cx),
        };
        let cancel = caller.session_runs.child();
        let task = self.app_runs.start(call, cancel, target, cx);
        cx.spawn(async move |this, cx| {
            let result = task.await;
            let _ = this.update(cx, |this, cx| {
                if let Some(call) = this.app_runs.finish(session, &id) {
                    let (result, receipt) = settle(&call, result);
                    this.finish_app_call_with_receipt(call, result, receipt, cx);
                }
            });
        })
        .detach();
    }

    fn run_target(&self, view: &Conversation) -> Result<Target, String> {
        if view.summary.archived || view.summary.cwd.is_empty() {
            return Err("app run needs an active local project session.".into());
        }
        let project = view.summary.cwd.clone();
        let root = view.settings.worktree_cwd.as_ref().unwrap_or(&project);
        Ok(Target {
            db: self.store.clone(),
            store: self.secret_store.clone(),
            project: Some(project.clone()),
            scope: None,
            roots: vec![root.into()],
        })
    }
}

#[test]
fn run_reattaches_only_to_the_same_request() {
    let (first, _) = std::sync::mpsc::channel();
    let (retry, response) = std::sync::mpsc::channel();
    let call = |reply| Call {
        session: 1,
        request_id: "run".into(),
        action: run::ACTION.into(),
        input: serde_json::json!({"argv":["echo"]}),
        reply,
    };
    let mut runs = Runs::default();
    runs.0.insert(
        (1, "run".into()),
        ActiveRun {
            call: call(first),
            cancel: Cancellation::default(),
        },
    );
    assert!(runs.reattach(&call(retry)));
    let call = runs.finish(1, "run").unwrap();
    call.reply.send(Ok(Value::Null)).unwrap();
    assert_eq!(response.recv().unwrap(), Ok(Value::Null));
}
