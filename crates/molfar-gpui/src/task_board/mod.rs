mod create;
mod detail;
mod edit;
mod list;
#[cfg(test)]
mod loading_tests;
mod review;
mod settings;
mod stage;
#[cfg(test)]
mod tests;
mod view;

use crate::runtime::{Database, locked};
use gpui::{App, Context, EventEmitter, FocusHandle, Focusable, ScrollHandle};
use molfar_core::task_board::types::Snapshot;

pub(crate) enum Event {
    Close,
    Stage {
        card_id: String,
        updated_at: i64,
        action: molfar_core::task_board::stage::lifecycle::types::StageAction,
    },
    Deliver {
        card_id: String,
        updated_at: i64,
        method: molfar_core::task_board::delivery::types::DeliveryMethod,
    },
    Reject {
        card_id: String,
        updated_at: i64,
    },
    OpenSession(String),
    Settings(molfar_core::task_board::stage::choice::settings::SettingsPatch),
}

pub(crate) struct Board {
    store: Database,
    focus: FocusHandle,
    scroll: ScrollHandle,
    cwd: String,
    projects: Vec<String>,
    creation: Option<create::state::Creation>,
    create_open: bool,
    project_only: bool,
    archived: bool,
    selected: Option<String>,
    snapshot: Option<Snapshot>,
    revision: u64,
    loading: bool,
    error: Option<String>,
    stage_pending: Option<String>,
    artifact: Option<stage::Artifact>,
    artifact_revision: u64,
    review: Option<review::Panel>,
    review_revision: u64,
    settings: Option<settings::Panel>,
    picker: Option<settings::Picker>,
    retry_anchor: crate::popover::AnchorSlot,
    delivery_open: Option<String>,
    github: std::collections::HashMap<String, bool>,
    github_probing: std::collections::HashSet<String>,
    editor: Option<edit::TaskEditor>,
    move_menu: Option<gpui::Entity<crate::popover::Menu>>,
    move_anchor: crate::popover::AnchorSlot,
    move_subscription: Option<gpui::Subscription>,
}

impl EventEmitter<Event> for Board {}
impl Focusable for Board {
    fn focus_handle(&self, cx: &App) -> FocusHandle {
        if let Some(panel) = &self.review {
            return panel.initial_focus(cx);
        }
        if let Some(editor) = &self.editor {
            return editor.initial_focus(cx);
        }
        if let Some(artifact) = &self.artifact {
            return artifact.focus.clone();
        }
        if let Some(focus) = self.settings_focus(cx) {
            return focus;
        }
        if self.create_open
            && let Some(draft) = &self.creation
        {
            return draft.title.read(cx).focus_handle(cx);
        }
        self.focus.clone()
    }
}

impl Board {
    pub(crate) fn new(store: Database, cx: &mut Context<Self>) -> Self {
        Self {
            store,
            focus: cx.focus_handle(),
            scroll: ScrollHandle::new(),
            cwd: String::new(),
            projects: Vec::new(),
            creation: None,
            create_open: false,
            project_only: false,
            archived: false,
            selected: None,
            snapshot: None,
            revision: 0,
            loading: false,
            error: None,
            stage_pending: None,
            artifact: None,
            artifact_revision: 0,
            review: None,
            review_revision: 0,
            settings: None,
            picker: None,
            retry_anchor: Default::default(),
            delivery_open: None,
            github: Default::default(),
            github_probing: Default::default(),
            editor: None,
            move_menu: None,
            move_anchor: Default::default(),
            move_subscription: None,
        }
    }

    #[cfg(test)]
    pub(crate) fn project_only_for_test(&self) -> bool {
        self.project_only
    }

    #[cfg(test)]
    pub(crate) fn archived_for_test(&self) -> bool {
        self.archived
    }

    pub(crate) fn set_context(&mut self, cwd: String, projects: Vec<String>) {
        if self.project_only && self.cwd != cwd {
            self.snapshot = None;
        }
        self.cwd = cwd;
        self.projects = projects;
    }

    pub(crate) fn refresh(&mut self, cx: &mut Context<Self>) {
        self.revision += 1;
        let revision = self.revision;
        self.loading = true;
        self.error = None;
        let store = self.store.clone();
        let project = self.project_only.then(|| self.cwd.clone());
        let archived = self.archived;
        let selected = self.selected.clone();
        let work = cx.background_executor().spawn(async move {
            locked(&store)?.board_snapshot(project.as_deref(), archived, selected.as_deref())
        });
        cx.spawn(async move |this, cx| {
            let result = work.await;
            let _ = this.update(cx, |this, cx| this.finish(revision, result, cx));
        })
        .detach();
        cx.notify();
    }

    fn finish(&mut self, revision: u64, result: Result<Snapshot, String>, cx: &mut Context<Self>) {
        if revision != self.revision {
            return;
        }
        self.loading = false;
        match result {
            Ok(snapshot) => {
                self.selected = snapshot.selected.clone();
                self.snapshot = Some(snapshot);
                self.reveal_selection();
                self.error = None;
            }
            Err(error) => {
                if self
                    .snapshot
                    .as_ref()
                    .is_some_and(|snapshot| snapshot.cards.is_empty())
                {
                    self.snapshot = None;
                }
                self.error = Some(error);
            }
        }
        cx.notify();
    }

    fn select(&mut self, id: String, cx: &mut Context<Self>) {
        if self.selected.as_ref() == Some(&id) {
            return;
        }
        self.selected = Some(id);
        self.refresh(cx);
    }

    fn reveal_selection(&self) {
        let Some(snapshot) = &self.snapshot else {
            return;
        };
        let Some(index) = snapshot
            .cards
            .iter()
            .position(|card| Some(&card.id) == self.selected.as_ref())
        else {
            return;
        };
        let column_headers = molfar_core::task_board::constants::COLUMNS
            .iter()
            .position(|(id, _)| *id == snapshot.cards[index].column_id)
            .unwrap_or(molfar_core::task_board::constants::COLUMNS.len())
            + 1;
        self.scroll.scroll_to_item(index + column_headers);
    }

    fn move_selection(&mut self, down: bool, cx: &mut Context<Self>) {
        let Some(snapshot) = &self.snapshot else {
            return;
        };
        let Some(index) = snapshot
            .cards
            .iter()
            .position(|card| Some(&card.id) == self.selected.as_ref())
        else {
            return;
        };
        let next = if down {
            (index + 1).min(snapshot.cards.len() - 1)
        } else {
            index.saturating_sub(1)
        };
        let id = snapshot.cards[next].id.clone();
        self.select(id, cx);
    }
}
