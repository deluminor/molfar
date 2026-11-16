#[cfg(test)]
mod tests;
mod view;

use super::{Board, Event, create::fields::TaskFields};
use crate::input;
use gpui::{Context, FocusHandle, Focusable, KeyDownEvent, Subscription, Window};
use molfar_core::task_board::{
    constants::BACKLOG,
    stage::{lifecycle::types::StageAction, owner::types::TaskEdit},
    types::Card,
};

pub(super) struct TaskEditor {
    card_id: String,
    updated_at: i64,
    base_editable: bool,
    fields: TaskFields,
    cancel_focus: FocusHandle,
    submit_focus: FocusHandle,
    busy: bool,
    error: Option<String>,
    reload_required: bool,
    _subscriptions: Vec<Subscription>,
}

impl TaskEditor {
    pub(super) fn initial_focus(&self, cx: &gpui::App) -> FocusHandle {
        self.fields.title.read(cx).focus_handle(cx)
    }

    fn edit(&self, cx: &gpui::App) -> TaskEdit {
        let text = |field: &gpui::Entity<crate::input::Input>| field.read(cx).content.to_string();
        let base = text(&self.fields.base);
        TaskEdit {
            title: text(&self.fields.title),
            description: text(&self.fields.description),
            acceptance_criteria: text(&self.fields.criteria),
            base_ref: self
                .base_editable
                .then(|| Some(base.trim().to_owned()).filter(|base| !base.is_empty())),
        }
    }

    fn can_submit(&self, cx: &gpui::App) -> bool {
        let filled =
            |field: &gpui::Entity<crate::input::Input>| !field.read(cx).content.trim().is_empty();
        !self.busy
            && !self.reload_required
            && filled(&self.fields.title)
            && filled(&self.fields.description)
    }
}

impl Board {
    pub(super) fn open_editor(&mut self, card: &Card, window: &mut Window, cx: &mut Context<Self>) {
        if self.stage_pending.is_some() || self.editor.is_some() {
            return;
        }
        let fields = TaskFields::new(cx);
        let values = [
            (&fields.title, card.title.clone()),
            (&fields.description, card.description.clone()),
            (&fields.criteria, card.acceptance_criteria.clone()),
            (&fields.base, card.base_ref.clone().unwrap_or_default()),
        ];
        for (field, value) in values {
            field.update(cx, |input, cx| input.set_text(value, cx));
        }
        let base_editable = card.column_id == BACKLOG;
        fields
            .base
            .update(cx, |input, _| input.set_read_only(!base_editable));

        let mut subscriptions = Vec::new();
        for field in fields.all() {
            subscriptions.push(cx.subscribe(field, |_, _, _: &input::Changed, cx| cx.notify()));
            subscriptions.push(cx.subscribe(field, |this, _, _: &input::Submitted, cx| {
                this.submit_editor(cx)
            }));
        }
        window.focus(&fields.title.read(cx).focus_handle(cx), cx);
        self.editor = Some(TaskEditor {
            card_id: card.id.clone(),
            updated_at: card.updated_at,
            base_editable,
            fields,
            cancel_focus: cx.focus_handle(),
            submit_focus: cx.focus_handle(),
            busy: false,
            error: None,
            reload_required: false,
            _subscriptions: subscriptions,
        });
        cx.notify();
    }

    pub(super) fn close_editor(&mut self, window: &mut Window, cx: &mut Context<Self>) {
        if self.editor.as_ref().is_some_and(|editor| editor.busy) {
            return;
        }
        let reload = self
            .editor
            .take()
            .is_some_and(|editor| editor.reload_required);
        if reload {
            self.refresh(cx);
        }
        window.focus(&self.focus, cx);
        cx.notify();
    }

    pub(super) fn submit_editor(&mut self, cx: &mut Context<Self>) {
        let Some(editor) = &mut self.editor else {
            return;
        };
        if !editor.can_submit(cx) || self.stage_pending.is_some() {
            return;
        }
        let action = StageAction::EditTask(editor.edit(cx));
        editor.busy = true;
        editor.error = None;
        editor.fields.set_read_only(true, cx);
        self.stage_pending = Some(editor.card_id.clone());
        cx.emit(Event::Stage {
            card_id: editor.card_id.clone(),
            updated_at: editor.updated_at,
            action,
        });
        cx.notify();
    }

    /// Returns whether the editor consumed this result; a failure keeps the draft.
    pub(super) fn finish_edit_update(
        &mut self,
        error: Option<String>,
        cx: &mut Context<Self>,
    ) -> bool {
        let Some(editor) = &mut self.editor else {
            return false;
        };
        if !editor.busy {
            return false;
        }
        editor.busy = false;
        match error {
            Some(error) => {
                editor.reload_required = error.starts_with(
                    molfar_core::task_board::stage::lifecycle::constants::CONFLICT_PREFIX,
                );
                editor.error = Some(error);
                editor.fields.set_read_only(false, cx);
                let base_editable = editor.base_editable;
                editor
                    .fields
                    .base
                    .update(cx, |input, _| input.set_read_only(!base_editable));
            }
            None => {
                let mut handles: Vec<FocusHandle> = editor
                    .fields
                    .all()
                    .iter()
                    .map(|field| field.read(cx).focus_handle(cx))
                    .collect();
                handles.extend([editor.cancel_focus.clone(), editor.submit_focus.clone()]);
                self.editor = None;
                self.refresh(cx);
                cx.spawn(async move |this, cx| {
                    let _ = this.update_in(cx, |this, window, cx| {
                        let inside = window
                            .focused(cx)
                            .is_none_or(|focus| handles.contains(&focus));
                        if this.editor.is_none() && inside {
                            window.focus(&this.focus, cx);
                        }
                    });
                })
                .detach();
            }
        }
        true
    }

    pub(super) fn editor_key(
        &mut self,
        event: &KeyDownEvent,
        window: &mut Window,
        cx: &mut Context<Self>,
    ) {
        let Some(editor) = &self.editor else {
            return;
        };
        let key = event.keystroke.key.as_str();
        let command = event.keystroke.modifiers.platform || event.keystroke.modifiers.control;
        if key == "enter" && command {
            if !editor.fields.is_composing(window, cx) {
                self.submit_editor(cx);
            }
        } else if key == "escape" {
            self.close_editor(window, cx);
        } else if key == "tab" {
            let mut handles: Vec<FocusHandle> = editor
                .fields
                .all()
                .iter()
                .map(|field| field.read(cx).focus_handle(cx))
                .collect();
            handles.extend([editor.cancel_focus.clone(), editor.submit_focus.clone()]);
            let current = handles
                .iter()
                .position(|focus| focus.is_focused(window))
                .unwrap_or(0);
            let step = if event.keystroke.modifiers.shift {
                handles.len() - 1
            } else {
                1
            };
            window.focus(&handles[(current + step) % handles.len()], cx);
        } else if matches!(key, "enter" | "space") && editor.cancel_focus.is_focused(window) {
            self.close_editor(window, cx);
        } else if matches!(key, "enter" | "space") && editor.submit_focus.is_focused(window) {
            self.submit_editor(cx);
        } else {
            return;
        }
        cx.stop_propagation();
    }
}
