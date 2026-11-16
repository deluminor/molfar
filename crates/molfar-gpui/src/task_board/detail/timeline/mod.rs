mod bar;
mod clock;
mod dialog;
mod elapsed;
mod inspection;
mod lane;
mod layout;
mod preview;
mod status;
mod view;

use gpui::{Context, EventEmitter, Render, Window, prelude::*};
use molfar_core::task_board::types::{Card, StageRun};

pub(crate) struct OpenSession(pub String);

#[derive(Default)]
pub(in crate::task_board) struct Timeline {
    card: Option<Card>,
    runs: Vec<StageRun>,
    visible: bool,
    expanded: bool,
    selected_run: Option<String>,
    hovered_run: Option<String>,
    inspect_focus: std::collections::HashMap<String, gpui::FocusHandle>,
    expand_focus: Option<gpui::FocusHandle>,
    close_focus: Option<gpui::FocusHandle>,
    details_focus: Option<gpui::FocusHandle>,
    details_scroll: Option<gpui::ScrollHandle>,
    chart_scroll: Option<gpui::ScrollHandle>,
    session_focus: std::collections::HashMap<String, gpui::FocusHandle>,
    now: i64,
    task: Option<gpui::Task<()>>,
}

impl EventEmitter<OpenSession> for Timeline {}

impl Timeline {
    pub(in crate::task_board) fn sync(
        &mut self,
        card: Option<Card>,
        runs: Vec<StageRun>,
        visible: bool,
        cx: &mut Context<Self>,
    ) {
        let runs: Vec<_> = runs
            .into_iter()
            .filter(|run| card.as_ref().is_some_and(|card| card.id == run.card_id))
            .collect();
        if self.expand_focus.is_none() {
            self.expand_focus = Some(cx.focus_handle());
            self.close_focus = Some(cx.focus_handle());
            self.details_focus = Some(cx.focus_handle());
            self.details_scroll = Some(gpui::ScrollHandle::new());
            self.chart_scroll = Some(gpui::ScrollHandle::new());
        }
        if !visible || self.card.as_ref().map(|card| &card.id) != card.as_ref().map(|card| &card.id)
        {
            self.expanded = false;
            self.selected_run = None;
            self.hovered_run = None;
        }
        let changed = self.card != card || self.runs != runs || self.visible != visible;
        if self.card.as_ref().map(|card| &card.id) != card.as_ref().map(|card| &card.id) {
            self.session_focus.clear();
        }
        self.inspect_focus
            .retain(|id, _| runs.iter().any(|run| &run.id == id));
        for run in &runs {
            self.inspect_focus
                .entry(run.id.clone())
                .or_insert_with(|| cx.focus_handle());
        }
        self.session_focus.retain(|id, _| {
            runs.iter()
                .any(|run| &run.id == id && run.session_id.is_some())
        });
        for run in runs.iter().filter(|run| run.session_id.is_some()) {
            self.session_focus
                .entry(run.id.clone())
                .or_insert_with(|| cx.focus_handle());
        }
        self.card = card;
        self.runs = runs;
        self.visible = visible;
        if changed {
            self.now = chrono::Utc::now().timestamp_millis();
            self.task = None;
            self.start_clock(cx);
            cx.notify();
        }
    }
}

impl Render for Timeline {
    fn render(&mut self, window: &mut Window, cx: &mut Context<Self>) -> impl IntoElement {
        let dialog = self.expanded.then(|| self.dialog(window, cx));
        gpui::div()
            .flex()
            .flex_col()
            .child(self.preview(cx))
            .child(self.view(false, cx))
            .children(dialog)
    }
}

#[cfg(test)]
#[path = "tests/clock.rs"]
mod clock_tests;
#[cfg(test)]
#[path = "tests/model.rs"]
mod model_tests;

#[cfg(test)]
#[path = "tests/inspection.rs"]
mod inspection_tests;
