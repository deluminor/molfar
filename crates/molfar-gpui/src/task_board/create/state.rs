use crate::input::Input;
use crate::popover::{AnchorSlot, Menu};
use gpui::{App, Entity, FocusHandle, Focusable, Subscription, Window};

pub(in crate::task_board) struct Creation {
    pub id: String,
    pub project: String,
    pub title: Entity<Input>,
    pub description: Entity<Input>,
    pub criteria: Entity<Input>,
    pub base: Entity<Input>,
    pub project_focus: FocusHandle,
    pub cancel_focus: FocusHandle,
    pub submit_focus: FocusHandle,
    pub project_anchor: AnchorSlot,
    pub project_menu: Option<Entity<Menu>>,
    pub busy: bool,
    pub error: Option<String>,
    pub _subscriptions: Vec<Subscription>,
    pub project_subscription: Option<Subscription>,
}

impl Creation {
    pub(super) fn is_composing(&self, window: &Window, cx: &App) -> bool {
        [&self.title, &self.description, &self.criteria, &self.base]
            .iter()
            .any(|input| {
                let input = input.read(cx);
                input.focus_handle(cx).is_focused(window) && input.is_composing()
            })
    }
    pub(super) fn owns_focus(&self, window: &Window, cx: &App) -> bool {
        [&self.project_focus, &self.cancel_focus, &self.submit_focus]
            .iter()
            .any(|focus| focus.is_focused(window))
            || [&self.title, &self.description, &self.criteria, &self.base]
                .iter()
                .any(|input| input.read(cx).focus_handle(cx).is_focused(window))
            || self
                .project_menu
                .as_ref()
                .is_some_and(|menu| menu.read(cx).focus_handle(cx).contains_focused(window, cx))
    }
}
