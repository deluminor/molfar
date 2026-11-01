use super::super::*;
use gpui::{TestAppContext, WindowHandle};
use molfar_core::{catalog::Model, store::Store, task_board::types::CardCreate};
use std::{
    path::{Path, PathBuf},
    process::Command,
};

#[derive(Clone)]
pub(in crate::shell::board_runtime) struct Provider {
    pub binary: PathBuf,
    pub models: Vec<Model>,
}

pub(super) struct Fixture {
    pub root: PathBuf,
    pub project: String,
    pub store: Database,
    pub provider: Provider,
}

impl Drop for Fixture {
    fn drop(&mut self) {
        let _ = std::fs::remove_dir_all(&self.root);
    }
}

pub(super) fn git(path: &Path, args: &[&str]) -> String {
    let output = Command::new("git")
        .current_dir(path)
        .args(args)
        .output()
        .unwrap();
    assert!(
        output.status.success(),
        "{}",
        String::from_utf8_lossy(&output.stderr)
    );
    String::from_utf8(output.stdout).unwrap()
}

impl Fixture {
    pub fn new() -> Self {
        let root = std::env::temp_dir().join(format!(
            "molfar-grill-ui-{}-{}",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        let path = root.join("project");
        std::fs::create_dir_all(&path).unwrap();
        git(&path, &["init", "-qb", "main"]);
        std::fs::write(path.join("tracked.txt"), "original\n").unwrap();
        git(&path, &["add", "tracked.txt"]);
        git(
            &path,
            &[
                "-c",
                "user.name=Fixture",
                "-c",
                "user.email=fixture@example.test",
                "-c",
                "commit.gpgsign=false",
                "commit",
                "-qm",
                "fixture",
            ],
        );
        let binary = root.join("fake-provider");
        std::fs::write(&binary, include_str!("provider.py")).unwrap();
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            std::fs::set_permissions(&binary, std::fs::Permissions::from_mode(0o700)).unwrap();
        }
        let project = path.to_str().unwrap().to_owned();
        let mut store = Store::open_desktop(&root.join("molfar.db")).unwrap();
        store
            .board_create(
                &CardCreate {
                    id: "card".into(),
                    project_cwd: project.clone(),
                    title: "Native Grill".into(),
                    description: "Inspect the project".into(),
                    acceptance_criteria: "Plan saved once".into(),
                    base_ref: Some("main".into()),
                },
                std::slice::from_ref(&project),
            )
            .unwrap();
        let provider = Provider {
            binary,
            models: vec![Model {
                id: "gpt-test".into(),
                name: "Fixture model".into(),
                alias_target: None,
                efforts: vec![],
                default_effort: None,
                fast: false,
                thinking: false,
                default: true,
                tiers: vec![],
                controls: vec![],
            }],
        };
        Self {
            root,
            project,
            store: Arc::new(Mutex::new(store)),
            provider,
        }
    }

    pub fn window(&self, cx: &mut TestAppContext) -> WindowHandle<Shell> {
        let store = self.store.clone();
        let project = self.project.clone();
        let provider = self.provider.clone();
        let window = cx.update(|cx| {
            cx.open_window(Default::default(), |_, cx| {
                cx.new(|cx| {
                    let mut shell = Shell::new(store, vec![], project, None, cx);
                    shell.board_state.fixture = Some(provider);
                    shell.workspace.preferences.notifications = false;
                    shell.workspace.preferences.sounds = false;
                    shell
                })
            })
            .unwrap()
        });
        cx.run_until_parked();
        window
    }

    pub fn card(&self) -> molfar_core::task_board::types::Card {
        locked(&self.store)
            .unwrap()
            .board_snapshot(None, false, Some("card"))
            .unwrap()
            .cards
            .remove(0)
    }
}

pub(super) fn wait_until(cx: &mut TestAppContext, predicate: impl Fn() -> bool) {
    let deadline = std::time::Instant::now() + Duration::from_secs(15);
    loop {
        cx.run_until_parked();
        if predicate() {
            return;
        }
        assert!(
            std::time::Instant::now() < deadline,
            "Board fixture timed out"
        );
        std::thread::sleep(Duration::from_millis(5));
    }
}
