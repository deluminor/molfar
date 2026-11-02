use crate::input::Input;
use gpui::{App, Entity, FocusHandle, Focusable, Subscription, Window};
use molfar_core::task_board::stage::owner::types::Review;

#[derive(Clone, Copy, PartialEq, Eq)]
pub(in crate::task_board) enum Mode {
    Questions,
    Plan,
}

pub(in crate::task_board) struct Panel {
    pub card_id: String,
    pub mode: Mode,
    pub focus: FocusHandle,
    pub cancel_focus: FocusHandle,
    pub submit_focus: FocusHandle,
    pub changes_focus: FocusHandle,
    pub reload_focus: FocusHandle,
    pub data: Option<Review>,
    pub answers: Vec<Entity<Input>>,
    pub note: Entity<Input>,
    pub plan: Entity<Input>,
    pub busy: bool,
    pub loading: bool,
    pub error: Option<String>,
    pub reload_required: bool,
    pub _subscriptions: Vec<Subscription>,
    pub answer_subscriptions: Vec<Subscription>,
}

impl Panel {
    pub(in crate::task_board) fn initial_focus(&self, cx: &App) -> FocusHandle {
        if self.data.is_none() {
            return self.focus.clone();
        }
        if self.mode == Mode::Plan {
            return self.plan.read(cx).focus_handle(cx);
        }
        self.answers
            .first()
            .unwrap_or(&self.note)
            .read(cx)
            .focus_handle(cx)
    }

    pub(super) fn fields(&self) -> Vec<Entity<Input>> {
        if self.mode == Mode::Plan {
            return vec![self.plan.clone()];
        }
        self.answers
            .iter()
            .cloned()
            .chain([self.note.clone()])
            .collect()
    }

    pub(super) fn handles(&self, cx: &App) -> Vec<FocusHandle> {
        if self.data.is_none() {
            let mut handles = vec![self.cancel_focus.clone()];
            if !self.loading {
                handles.push(self.submit_focus.clone());
            }
            return handles;
        }
        let mut handles: Vec<_> = self
            .fields()
            .iter()
            .map(|input| input.read(cx).focus_handle(cx))
            .collect();
        handles.push(self.cancel_focus.clone());
        if self.reload_required {
            handles.push(self.reload_focus.clone());
        }
        if self.mode == Mode::Questions && !self.answers.is_empty() {
            handles.push(self.changes_focus.clone());
        }
        handles.push(self.submit_focus.clone());
        handles
    }

    pub(super) fn composing(&self, window: &Window, cx: &App) -> bool {
        self.fields().iter().any(|field| {
            let input = field.read(cx);
            input.focus_handle(cx).is_focused(window) && input.is_composing()
        })
    }

    pub(super) fn owns_focus(&self, window: &Window, cx: &App) -> bool {
        self.focus.is_focused(window)
            || self
                .handles(cx)
                .iter()
                .any(|focus| focus.is_focused(window))
    }

    pub(super) fn can_submit(&self, changes: bool, cx: &App) -> bool {
        let Some(data) = &self.data else { return false };
        if self.busy || self.loading || self.reload_required {
            return false;
        }
        if self.mode == Mode::Plan {
            let body = self.plan.read(cx).content.as_ref();
            return !body.trim().is_empty() && body != data.plan;
        }
        if changes || self.answers.is_empty() {
            return !self.note.read(cx).content.trim().is_empty();
        }
        true
    }
}
