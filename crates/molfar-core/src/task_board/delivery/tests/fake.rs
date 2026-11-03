use super::super::{
    port::DeliveryPort,
    types::{ExistingPullRequest, PullRequest},
};
use crate::{
    store::Store,
    task_board::{
        stage::{
            checkout::types::CheckoutSnapshot,
            contracts::{constants::SPEC, types::ParsedArtifact},
            lifecycle::artifacts,
        },
        types::Card,
    },
};
use rusqlite::{params, Connection};
use std::{cell::RefCell, collections::HashSet, path::Path, sync::Mutex};

pub(super) const BRANCH: &str = "molfar/task-card";
pub(super) const URL: &str = "https://github.com/acme/app/pull/7";

#[derive(Default)]
pub(super) struct Fake {
    pub calls: RefCell<Vec<String>>,
    pub failing: RefCell<HashSet<&'static str>>,
    pub requests: RefCell<Vec<PullRequest>>,
    pub existing: RefCell<Option<ExistingPullRequest>>,
    pub dirty: RefCell<bool>,
}

impl Fake {
    fn step(&self, name: &'static str) -> Result<(), String> {
        self.calls.borrow_mut().push(name.into());
        if self.failing.borrow().contains(name) {
            return Err(format!("{name} failed"));
        }
        Ok(())
    }

    pub(super) fn fail(&self, name: &'static str) {
        self.failing.borrow_mut().insert(name);
    }

    pub(super) fn heal(&self, name: &'static str) {
        self.failing.borrow_mut().remove(name);
    }

    pub(super) fn count(&self, name: &str) -> usize {
        self.calls
            .borrow()
            .iter()
            .filter(|call| *call == name)
            .count()
    }
}

impl DeliveryPort for Fake {
    fn retained_worktree(&self, card: &Card) -> Result<String, String> {
        self.step("retained")?;
        card.worktree_path
            .clone()
            .filter(|path| Path::new(path).exists())
            .ok_or_else(|| "Retained worktree is missing".into())
    }

    fn snapshot(&self, _worktree: &Path) -> Result<CheckoutSnapshot, String> {
        self.step("snapshot")?;
        Ok(CheckoutSnapshot {
            head: "head".into(),
            porcelain: if *self.dirty.borrow() {
                " M file".into()
            } else {
                String::new()
            },
            fingerprint: "bytes".into(),
        })
    }

    fn remotes(&self, _project: &Path) -> Result<Vec<String>, String> {
        Ok(vec!["origin".into()])
    }

    fn github_repo(&self, _worktree: &Path) -> Result<String, String> {
        self.step("github").map(|_| "acme/app".into())
    }

    fn push(&self, _worktree: &Path) -> Result<(), String> {
        self.step("push")
    }

    fn create_pull_request(
        &self,
        _worktree: &Path,
        request: &PullRequest,
    ) -> Result<String, String> {
        self.step("create")?;
        self.requests.borrow_mut().push(request.clone());
        Ok(URL.into())
    }

    fn existing_pull_request(&self, _worktree: &Path) -> Option<ExistingPullRequest> {
        self.calls.borrow_mut().push("existing".into());
        self.existing.borrow().clone()
    }

    fn squash_merge(&self, _worktree: &Path, repo: &str, number: i64) -> Result<(), String> {
        assert_eq!((repo, number), ("acme/app", 7));
        self.step("merge")
    }

    fn remove_worktree(
        &self,
        _project: &Path,
        _worktree: &Path,
        force: bool,
    ) -> Result<(), String> {
        self.step(if force {
            "remove:force"
        } else {
            "remove:clean"
        })
    }

    fn remove_task_branch(&self, _project: &Path, branch: &str) -> Result<bool, String> {
        assert_eq!(branch, BRANCH);
        self.step("branch").map(|_| true)
    }
}

pub(super) struct Board {
    _dir: tempfile::TempDir,
    pub store: Mutex<Store>,
    pub worktree: String,
}

impl Board {
    pub(super) fn at(column: &str, state: &str) -> Self {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("molfar.db");
        let store = Store::open_desktop(&path).unwrap();
        let worktree = dir.path().join("tree");
        std::fs::create_dir(&worktree).unwrap();
        let worktree = worktree.to_str().unwrap().to_owned();
        let conn = Connection::open(&path).unwrap();
        conn.execute(
            "INSERT INTO task_board_cards(id,number,project_cwd,title,description,column_id,run_state,position,branch,base_ref,worktree_path,created_at,updated_at) VALUES('card',4,'/project','Card title','Do it',?1,?2,1,?3,'refs/remotes/origin/main',?4,1,10)",
            params![column, state, BRANCH, worktree],
        )
        .unwrap();
        let spec = ParsedArtifact {
            kind: SPEC.into(),
            body: "---\npr_title: \"feat(board): deliver\"\n---\n# Spec".into(),
        };
        artifacts::publish(
            &conn,
            &dir.path().join("task-board"),
            "card",
            &spec,
            "stage",
            None,
            1,
        )
        .unwrap();
        Self {
            _dir: dir,
            store: Mutex::new(store),
            worktree,
        }
    }

    pub(super) fn card(&self) -> Card {
        self.store.lock().unwrap().board_card("card").unwrap()
    }

    pub(super) fn start(&self) -> Card {
        let revision = self.card().updated_at;
        self.store
            .lock()
            .unwrap()
            .board_deliver_start("card", revision)
            .unwrap()
    }
}
