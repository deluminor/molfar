mod artifacts;
mod board_baseline;
mod clients;
mod notes;
mod scope;
mod sessions_manage;
mod stage;
mod stage_runtime;
use super::*;
use gpui::{TestAppContext, WindowHandle};
use molfar_core::{
    external_mcp::{
        grants::types::{DOMAIN, GRANT},
        transport::reply_channel,
    },
    store::Store,
};
use std::{
    process::Command,
    sync::{Arc, Mutex},
};

pub(super) struct Fixture {
    pub(super) root: std::path::PathBuf,
    pub(super) granted: String,
    pub(super) other: String,
    pub(super) store: Database,
    pub(super) sessions: (i64, i64),
}

impl Drop for Fixture {
    fn drop(&mut self) {
        let _ = std::fs::remove_dir_all(&self.root);
    }
}

fn project(path: &std::path::Path) -> String {
    std::fs::create_dir_all(path).unwrap();
    for args in [
        &["init", "-q"][..],
        &[
            "-c",
            "user.name=Fixture",
            "-c",
            "user.email=fixture@example.test",
            "-c",
            "commit.gpgsign=false",
            "commit",
            "--allow-empty",
            "-qm",
            "fixture",
        ],
    ] {
        assert!(
            Command::new("git")
                .current_dir(path)
                .args(args)
                .status()
                .unwrap()
                .success()
        );
    }
    path.to_str().unwrap().to_owned()
}

pub(super) fn fixture() -> Fixture {
    let root = std::env::temp_dir().join(format!(
        "molfar-external-{}",
        molfar_core::familiar::new_id()
    ));
    let granted = project(&root.join("granted"));
    let other = project(&root.join("other"));
    let store = Store::open_desktop(&root.join("molfar.db")).unwrap();
    let mine = store.create("codex", &granted).unwrap().id;
    let theirs = store.create("codex", &other).unwrap().id;
    Fixture {
        root,
        granted,
        other,
        store: Arc::new(Mutex::new(store)),
        sessions: (mine, theirs),
    }
}

pub(super) fn window(f: &Fixture, cx: &mut TestAppContext) -> WindowHandle<Shell> {
    let store = f.store.clone();
    let summaries = locked(&store).unwrap().sessions().unwrap();
    let mut state = crate::workspace::Workspace::default();
    state.add_project(&f.granted);
    state.add_project(&f.other);
    let saved = serde_json::to_string(&state).unwrap();
    let cwd = f.granted.clone();
    let window = cx.update(|cx| {
        cx.open_window(Default::default(), |_, cx| {
            cx.new(|cx| Shell::new(store, summaries, cwd, Some(saved), cx))
        })
        .unwrap()
    });
    cx.run_until_parked();
    window
}

pub(super) fn principal(f: &Fixture) -> Principal {
    Principal {
        client_id: "client".into(),
        name: "OpenBot".into(),
        grants: vec![
            GRANT::Read(DOMAIN::Board),
            GRANT::Write(DOMAIN::Board),
            GRANT::BoardCreate,
            GRANT::Read(DOMAIN::Sessions),
            GRANT::Write(DOMAIN::Sessions),
            GRANT::SessionsStop,
        ],
        resources: vec![],
        projects: vec![f.granted.clone(), "/not/registered".into()],
    }
}

pub(super) fn call(
    window: WindowHandle<Shell>,
    principal: &Principal,
    tool: &'static str,
    arguments: Value,
    cx: &mut TestAppContext,
) -> Result<Value, String> {
    let (reply, mut result) = reply_channel();
    let call = Call {
        principal: principal.clone(),
        tool,
        arguments,
        reply,
    };
    window
        .update(cx, |shell, _, cx| shell.handle_external_call(call, cx))
        .unwrap();
    cx.run_until_parked();
    result.try_recv().expect("the external call must settle")
}
