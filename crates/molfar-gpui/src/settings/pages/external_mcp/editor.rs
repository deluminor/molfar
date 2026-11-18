use super::*;
use crate::input::{Input, Submitted};
use crate::settings::widgets::red;
use gpui::{Entity, Focusable, KeyDownEvent, Subscription, Window};

#[derive(PartialEq)]
pub(super) enum Target {
    Add,
    Rename(String),
    Port,
}

pub(super) struct Editor {
    target: Target,
    field: Entity<Input>,
    error: Option<String>,
    _submit: Subscription,
}

impl SettingsView {
    pub(super) fn open_external_editor(
        &mut self,
        target: Target,
        initial: &str,
        window: &mut Window,
        cx: &mut Context<Self>,
    ) {
        let (label, placeholder) = if target == Target::Port {
            ("Port", "1024–65535")
        } else {
            ("Name", "e.g. Laptop agent")
        };
        let field = cx.new(|cx| {
            let mut input = Input::field(label, placeholder, content(0.48), cx);
            input.set_text(initial.to_owned(), cx);
            input.select_range(0..initial.len(), cx);
            input
        });
        let submit = cx.subscribe(&field, |this, _, _: &Submitted, cx| {
            this.submit_external_editor(cx)
        });
        window.focus(&field.focus_handle(cx), cx);
        self.external_page.editor = Some(Editor {
            target,
            field,
            error: None,
            _submit: submit,
        });
        cx.notify();
    }

    fn submit_external_editor(&mut self, cx: &mut Context<Self>) {
        let Some(editor) = self.external_page.editor.as_ref() else {
            return;
        };
        let name = editor.field.read(cx).content.to_string();
        let event = match &editor.target {
            Target::Add => SettingsEvent::ExternalCreateClient { name },
            Target::Rename(id) => SettingsEvent::ExternalRename {
                id: id.clone(),
                name,
            },
            Target::Port => match name.trim().parse::<u16>() {
                Ok(port) if port >= 1024 => SettingsEvent::ExternalSetPort(port),
                _ => {
                    self.external_edit_result(Err("Choose a port from 1024 to 65535.".into()), cx);
                    return;
                }
            },
        };
        cx.emit(event);
    }

    pub(crate) fn external_edit_result(
        &mut self,
        result: Result<(), String>,
        cx: &mut Context<Self>,
    ) {
        match result {
            Ok(()) => {
                if self
                    .external_page
                    .editor
                    .take()
                    .is_some_and(|editor| editor.target == Target::Add)
                {
                    self.external_page.copied_reset = None;
                }
            }
            Err(error) => {
                if let Some(editor) = &mut self.external_page.editor {
                    editor.error = Some(error);
                }
            }
        }
        cx.notify();
    }

    pub(in crate::settings) fn dismiss_external_transient(
        &mut self,
        window: &mut Window,
        cx: &mut Context<Self>,
    ) -> bool {
        if self.external_page.editor.is_some() {
            self.external_edit_result(Ok(()), cx);
        } else if self.external_page.confirm_revoke.take().is_none() {
            return false;
        }

        window.focus(&self.focus, cx);
        cx.notify();
        true
    }

    pub(super) fn external_editor(
        &self,
        target: &Target,
        cx: &mut Context<Self>,
    ) -> Option<AnyElement> {
        let editor = self
            .external_page
            .editor
            .as_ref()
            .filter(|editor| editor.target == *target)?;
        let submit = if *target == Target::Add {
            "Create"
        } else {
            "Save"
        };
        Some(
            div()
                .flex()
                .flex_col()
                .gap_1()
                .on_key_down(cx.listener(|this, event: &KeyDownEvent, window, cx| {
                    if event.keystroke.key == "escape"
                        && this.dismiss_external_transient(window, cx)
                    {
                        cx.stop_propagation();
                    }
                }))
                .child(
                    div()
                        .flex()
                        .items_center()
                        .gap_2()
                        .child(
                            div()
                                .min_w_0()
                                .flex_1()
                                .rounded_md()
                                .border_1()
                                .border_color(content(0.14))
                                .px_2()
                                .py_1()
                                .child(editor.field.clone()),
                        )
                        .child(
                            secondary_button("external-editor-submit", submit, false, false)
                                .child(submit)
                                .on_click(
                                    cx.listener(|this, _, _, cx| this.submit_external_editor(cx)),
                                ),
                        )
                        .child(
                            secondary_button("external-editor-cancel", "Cancel", false, false)
                                .child("Cancel")
                                .on_click(cx.listener(|this, _, _, cx| {
                                    this.external_edit_result(Ok(()), cx)
                                })),
                        ),
                )
                .children(editor.error.as_ref().map(|error| {
                    div()
                        .id("external-edit-error")
                        .debug_selector(|| "external-edit-error".into())
                        .text_size(px(11.))
                        .text_color(red(0.9))
                        .child(error.clone())
                }))
                .into_any_element(),
        )
    }
}
