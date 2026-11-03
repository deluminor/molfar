use super::super::Board;
use crate::{input::form_field, modal, theme::*};
use gpui::{AnyElement, Context, Role, Window, div, prelude::*, px};
use molfar_core::task_board::{
    constants::{BACKLOG, IDLE, PLAN_APPROVAL},
    types::Card,
};

fn editable(card: &Card) -> bool {
    !card.archived
        && card.run_state == IDLE
        && matches!(card.column_id.as_str(), BACKLOG | PLAN_APPROVAL)
}

impl Board {
    pub(in crate::task_board) fn edit_action(
        &self,
        card: &Card,
        pending: bool,
        cx: &mut Context<Self>,
    ) -> Option<AnyElement> {
        if !editable(card) {
            return None;
        }
        let edited = card.clone();
        Some(
            modal::disabled(modal::ghost_button("board-edit-task", "Edit task"), pending)
                .debug_selector(|| "board-edit-task".into())
                .on_click(
                    cx.listener(move |this, _, window, cx| this.open_editor(&edited, window, cx)),
                )
                .into_any_element(),
        )
    }

    pub(in crate::task_board) fn editor_overlay(
        &self,
        window: &Window,
        cx: &mut Context<Self>,
    ) -> Option<AnyElement> {
        let editor = self.editor.as_ref()?;
        let busy = editor.busy;
        let submit = if busy { "Saving…" } else { "Save task" };
        let cancel = if editor.reload_required {
            "Close and reload"
        } else {
            "Cancel"
        };
        let base_label = if editor.base_editable {
            "Base branch (optional)"
        } else {
            "Base branch (fixed once the card has started)"
        };

        let card =
            modal::card()
                .w(px(520.))
                .max_w_full()
                .max_h_full()
                .id("board-edit-dialog")
                .debug_selector(|| "board-edit-dialog".into())
                .role(Role::Dialog)
                .aria_label("Edit task")
                .on_key_down(cx.listener(Self::editor_key))
                .child(
                    modal::card_body()
                        .id("board-edit-body")
                        .gap_3()
                        .max_h_full()
                        .overflow_y_scroll()
                        .child(modal::title("Edit task"))
                        .child(modal::body(
                            "Saving writes a new task version for the next stage.",
                        ))
                        .child(form_field("Title", editor.fields.title.clone(), 32.))
                        .child(form_field(
                            "Description",
                            editor.fields.description.clone(),
                            92.,
                        ))
                        .child(form_field(
                            "Acceptance criteria (optional)",
                            editor.fields.criteria.clone(),
                            70.,
                        ))
                        .child(form_field(base_label, editor.fields.base.clone(), 32.))
                        .when_some(editor.error.clone(), |body, error| {
                            body.child(
                                div()
                                    .id("board-edit-error")
                                    .debug_selector(|| "board-edit-error".into())
                                    .role(Role::Alert)
                                    .text_size(px(12.))
                                    .child(error),
                            )
                        })
                        .child(
                            modal::actions()
                                .mt_1()
                                .child(
                                    modal::disabled(
                                        modal::ghost_button("board-edit-cancel", cancel),
                                        busy,
                                    )
                                    .debug_selector(|| "board-edit-cancel".into())
                                    .track_focus(&editor.cancel_focus)
                                    .border_1()
                                    .border_color(content(0.))
                                    .focus_visible(|s| s.border_color(accent_color()))
                                    .on_click(cx.listener(
                                        |this, _, window, cx| this.close_editor(window, cx),
                                    )),
                                )
                                .child(
                                    modal::disabled(
                                        modal::primary_button("board-edit-submit", submit),
                                        !editor.can_submit(cx),
                                    )
                                    .debug_selector(|| "board-edit-submit".into())
                                    .track_focus(&editor.submit_focus)
                                    .border_1()
                                    .border_color(content(0.))
                                    .focus_visible(|s| s.border_color(accent_color()))
                                    .on_click(cx.listener(|this, _, _, cx| this.submit_editor(cx))),
                                ),
                        ),
                );
        let weak = cx.weak_entity();
        let overlay = div().absolute().inset_0().child(modal::overlay(
            "board-edit",
            card,
            move |window, cx| {
                let _ = weak.update(cx, |this, cx| this.close_editor(window, cx));
            },
        ));
        Some(modal::window_overlay(window, overlay).into_any_element())
    }
}
