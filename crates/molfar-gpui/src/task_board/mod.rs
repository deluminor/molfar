pub(crate) mod controls;
mod create;
mod detail;
mod edit;
mod kanban;
mod load;
#[cfg(test)]
mod loading_tests;
mod project;
#[cfg(test)]
mod project_tests;
mod review;
mod settings;
mod stage;
#[cfg(test)]
mod tests;
mod view;

use crate::runtime::Database;
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
    /// The project filter the user picked, to remember across launches.
    ProjectFilter(Option<String>),
    Settings(molfar_core::task_board::stage::choice::settings::SettingsPatch),
}

pub(crate) struct Board {
    store: Database,
    focus: FocusHandle,
    scroll: ScrollHandle,
    board_bar: kanban::scroll::Bar,
    cwd: String,
    projects: Vec<String>,
    appearances:
        std::collections::HashMap<String, molfar_core::project_appearance::ProjectAppearance>,
    creation: Option<create::state::Creation>,
    create_open: bool,
    project_only: bool,
    project_filter: Option<String>,
    project_menu: Option<gpui::Entity<crate::popover::Menu>>,
    project_anchor: crate::popover::AnchorSlot,
    project_subscription: Option<gpui::Subscription>,
    detail_tab: Option<String>,
    detail_version: Option<i64>,
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
    column_anchors: Vec<(
        molfar_core::task_board::stage::agent::AgentStage,
        crate::popover::AnchorSlot,
    )>,
    column_scrolls: std::cell::RefCell<std::collections::HashMap<String, ScrollHandle>>,
    detail_content: Option<detail::Content>,
    card_usage: detail::usage::State,
    drawer_opens: u64,
    dragging: Option<String>,
    drag_over: Option<String>,
    drag_sessions: u64,
    drawer_open: bool,
    edge_pointer: Option<(f32, f32, f32)>,
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
            board_bar: Default::default(),
            cwd: String::new(),
            projects: Vec::new(),
            appearances: Default::default(),
            creation: None,
            create_open: false,
            project_only: false,
            project_filter: None,
            project_menu: None,
            project_anchor: Default::default(),
            project_subscription: None,
            detail_tab: None,
            detail_version: None,
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
            column_anchors: molfar_core::task_board::stage::agent::AgentStage::ALL
                .into_iter()
                .map(|stage| (stage, Default::default()))
                .collect(),
            column_scrolls: Default::default(),
            detail_content: None,
            card_usage: Default::default(),
            drawer_opens: 0,
            dragging: None,
            drag_over: None,
            drag_sessions: 0,
            drawer_open: false,
            edge_pointer: None,
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

    /// Restores a remembered project filter on a board that has none yet.
    pub(crate) fn restore_project_filter(&mut self, project: Option<String>) {
        if self.project_filter.is_none() && project.is_some() {
            self.project_filter = project;
            self.snapshot = None;
            self.revision += 1;
        }
    }

    pub(crate) fn set_context(&mut self, cwd: String, projects: Vec<String>) {
        if self.project_only && self.cwd != cwd {
            self.snapshot = None;
            self.project_filter = Some(cwd.clone());
            self.revision += 1;
        }
        if self
            .project_filter
            .as_ref()
            .is_some_and(|selected| selected != &cwd && !projects.contains(selected))
        {
            self.project_filter = None;
            self.project_only = false;
            self.snapshot = None;
            self.revision += 1;
        }
        self.cwd = cwd;
        self.projects = projects;
    }
}
