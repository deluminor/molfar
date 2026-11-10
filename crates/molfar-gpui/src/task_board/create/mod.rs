pub(super) mod fields;
mod project;
pub(super) mod state;
#[cfg(test)]
mod success_tests;
#[cfg(test)]
mod tests;
mod view;

use super::Board;
use crate::input;
use crate::popover::AnchorSlot;
use fields::TaskFields;
use gpui::{Context, Focusable, KeyDownEvent, Window};
use molfar_core::task_board::types::{Card, CardCreate};
use state::Creation;

impl Board {
    pub(super) fn open_create(&mut self, window: &mut Window, cx: &mut Context<Self>) {
        if self.creation.is_none() {
            // The filtered project first, then the current one, then any local one.
            let preferred = self.project_filter.as_deref().unwrap_or(&self.cwd);
            let project = self
                .projects
                .iter()
                .find(|path| path.as_str() == preferred && !path.starts_with("remote://"))
                .or_else(|| {
                    self.projects
                        .iter()
                        .find(|path| !path.starts_with("remote://"))
                })
                .cloned()
                .unwrap_or_default();
            let TaskFields {
                title,
                description,
                criteria,
                base,
            } = TaskFields::new(cx);
            let fields = [&title, &description, &criteria, &base];
            let mut subscriptions = Vec::new();
            for field in fields {
                subscriptions.push(cx.subscribe(field, |_, _, _: &input::Changed, cx| cx.notify()));
                subscriptions.push(cx.subscribe(field, |this, _, _: &input::Submitted, cx| {
                    this.submit_create(cx)
                }));
            }
            self.creation = Some(Creation {
                id: molfar_core::familiar::new_id(),
                project,
                title,
                description,
                criteria,
                base,
                project_focus: cx.focus_handle(),
                cancel_focus: cx.focus_handle(),
                submit_focus: cx.focus_handle(),
                project_anchor: AnchorSlot::default(),
                project_menu: None,
                busy: false,
                error: None,
                _subscriptions: subscriptions,
                project_subscription: None,
            });
        }
        self.create_open = true;
        let draft = self.creation.as_ref().unwrap();
        window.focus(&draft.title.read(cx).focus_handle(cx), cx);
        cx.notify();
    }

    pub(super) fn close_create(&mut self, window: &mut Window, cx: &mut Context<Self>) {
        if self.creation.as_ref().is_some_and(|draft| draft.busy) {
            return;
        }
        self.create_open = false;
        if let Some(draft) = self.creation.as_mut() {
            draft.project_menu = None;
        }
        window.focus(&self.focus, cx);
        cx.notify();
    }

    pub(super) fn submit_create(&mut self, cx: &mut Context<Self>) {
        if !self.create_open {
            return;
        }
        let Some(draft) = &mut self.creation else {
            return;
        };
        if draft.busy {
            return;
        }
        let input = CardCreate {
            id: draft.id.clone(),
            project_cwd: draft.project.clone(),
            title: draft.title.read(cx).content.to_string(),
            description: draft.description.read(cx).content.to_string(),
            acceptance_criteria: draft.criteria.read(cx).content.to_string(),
            base_ref: (!draft.base.read(cx).content.trim().is_empty())
                .then(|| draft.base.read(cx).content.to_string()),
        };
        draft.busy = true;
        draft.error = None;
        for field in [
            &draft.title,
            &draft.description,
            &draft.criteria,
            &draft.base,
        ] {
            field.update(cx, |input, _| input.set_read_only(true));
        }
        let store = self.store.clone();
        let projects = self.projects.clone();
        let id = input.id.clone();
        let work = cx
            .background_executor()
            .spawn(async move { crate::runtime::locked(&store)?.board_create(&input, &projects) });
        cx.spawn(async move |this, cx| {
            let result = work.await;
            let _ = this.update_in(cx, |this, window, cx| {
                this.finish_create(&id, result, window, cx)
            });
        })
        .detach();
        cx.notify();
    }

    pub(super) fn finish_create(
        &mut self,
        id: &str,
        result: Result<Card, String>,
        window: &mut Window,
        cx: &mut Context<Self>,
    ) {
        let Some(draft) = &mut self.creation else {
            return;
        };
        if draft.id != id {
            return;
        }
        let restore_focus = draft.owns_focus(window, cx);
        draft.busy = false;
        for field in [
            &draft.title,
            &draft.description,
            &draft.criteria,
            &draft.base,
        ] {
            field.update(cx, |input, _| input.set_read_only(false));
        }
        match result {
            Ok(card) => {
                self.creation = None;
                self.create_open = false;
                if self.archived || self.project_only || self.project_filter.is_some() {
                    self.snapshot = None;
                }
                self.archived = false;
                self.project_only = false;
                self.project_filter = None;
                self.reset_detail_artifact();
                self.selected = Some(card.id);
                self.refresh(cx);
                if restore_focus {
                    window.focus(&self.focus, cx);
                }
            }
            Err(error) => {
                draft.error = Some(error);
            }
        }
        cx.notify();
    }

    pub(super) fn create_key(
        &mut self,
        event: &KeyDownEvent,
        window: &mut Window,
        cx: &mut Context<Self>,
    ) {
        let Some(draft) = &self.creation else {
            return;
        };
        if event.keystroke.key == "enter"
            && (event.keystroke.modifiers.platform || event.keystroke.modifiers.control)
        {
            if draft.is_composing(window, cx) {
                return;
            }
            self.submit_create(cx);
        } else if event.keystroke.key == "escape" {
            self.close_create(window, cx);
        } else if event.keystroke.key == "tab" {
            let handles = [
                draft.project_focus.clone(),
                draft.title.read(cx).focus_handle(cx),
                draft.description.read(cx).focus_handle(cx),
                draft.criteria.read(cx).focus_handle(cx),
                draft.base.read(cx).focus_handle(cx),
                draft.cancel_focus.clone(),
                draft.submit_focus.clone(),
            ];
            let current = handles
                .iter()
                .position(|focus| focus.is_focused(window))
                .unwrap_or(0);
            let next = if event.keystroke.modifiers.shift {
                (current + handles.len() - 1) % handles.len()
            } else {
                (current + 1) % handles.len()
            };
            window.focus(&handles[next], cx);
        } else if event.keystroke.key == "enter" || event.keystroke.key == "space" {
            if draft.project_focus.is_focused(window) {
                self.open_create_project(window, cx);
            } else if draft.cancel_focus.is_focused(window) {
                self.close_create(window, cx);
            } else if draft.submit_focus.is_focused(window) {
                self.submit_create(cx);
            } else {
                return;
            }
        } else {
            return;
        }
        cx.stop_propagation();
    }
}
