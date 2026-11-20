use super::*;
use crate::shell::app_run::{self, Target};
use molfar_core::{familiar::bridge::Call, secrets::Scope};

impl Familiars {
    pub(super) fn dispatch_run(&mut self, call: Call, familiar: &Familiar, cx: &mut Context<Self>) {
        let session = call.session;
        let id = call.request_id.clone();
        let roots = match roots(familiar) {
            Ok(roots) => roots,
            Err(error) => return self.finish_call(call, Err(error), cx),
        };
        let Some(view) = self.secret_chat(session, cx) else {
            return self.finish_call(call, Err("Familiar session unavailable.".into()), cx);
        };
        let cancel = view.read(cx).session_runs.child();
        let task = self.app_runs.start(
            call,
            cancel,
            Target {
                db: self.store.clone(),
                store: self.secret_store.clone(),
                project: None,
                scope: Some(Scope::Familiar(familiar.id.clone())),
                roots,
            },
            cx,
        );
        cx.spawn(async move |this, cx| {
            let result = task.await;
            let _ = this.update(cx, |this, cx| {
                if let Some(call) = this.app_runs.finish(session, &id) {
                    let (result, receipt) = app_run::settle(&call, result);
                    this.finish_call_with_receipt(call, result, receipt, cx);
                }
            });
        })
        .detach();
    }
}

fn roots(familiar: &Familiar) -> Result<Vec<std::path::PathBuf>, String> {
    if familiar.projects.is_empty() {
        return Err("app run needs an assigned project".into());
    }
    let roots: Vec<_> = familiar
        .projects
        .iter()
        .filter(|project| !project.starts_with("remote://"))
        .map(std::path::PathBuf::from)
        .filter(|path| path.is_absolute())
        .collect();
    if roots.is_empty() {
        return Err("app run needs an assigned local project".into());
    }
    Ok(roots)
}

#[test]
fn run_rejected_for_familiar_without_project() {
    assert_eq!(
        roots(&Familiar::default()).unwrap_err(),
        "app run needs an assigned project"
    );
}
