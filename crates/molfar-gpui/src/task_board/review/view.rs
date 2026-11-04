use super::{super::Board, Mode};
use crate::task_board::controls;
use crate::{
    input, modal,
    theme::{accent_color, content},
};
use gpui::{AnyElement, Context, Role, Window, div, prelude::*, px};

impl Board {
    pub(in crate::task_board) fn review_overlay(
        &self,
        window: &Window,
        cx: &mut Context<Self>,
    ) -> Option<AnyElement> {
        let panel = self.review.as_ref()?;
        let title = match panel.mode {
            Mode::Plan => "Edit plan",
            Mode::Questions => "Review questions",
            Mode::Rework => "Select findings for rework",
        };
        let mut body = modal::card_body()
            .id("board-owner-body")
            .gap_3()
            .max_h_full()
            .overflow_y_scroll()
            .child(modal::title(title));
        if panel.loading {
            body = body.child(
                div()
                    .id("board-owner-loading")
                    .debug_selector(|| "board-owner-loading".into())
                    .role(Role::Status)
                    .child("Loading review…"),
            );
        }
        if let Some(data) = &panel.data {
            if panel.mode == Mode::Plan {
                body = body
                    .child(modal::body(
                        "Saving creates a new plan version. Previous versions stay available.",
                    ))
                    .child(input::form_field("Plan", panel.plan.clone(), 310.));
            } else if panel.mode == Mode::Rework {
                body = body
                    .child(self.rework_findings(cx))
                    .child(input::form_field("Rework note", panel.note.clone(), 100.));
            } else {
                for (question, answer) in data.questions().iter().zip(&panel.answers) {
                    body = body.child(
                        div()
                            .flex()
                            .flex_col()
                            .gap_2()
                            .child(
                                div()
                                    .text_size(px(13.))
                                    .child(format!("Q{} · {}", question.number, question.title)),
                            )
                            .when(!question.body.is_empty(), |d| {
                                d.child(modal::body(question.body.clone()))
                            })
                            .child(input::form_field(
                                &format!("Answer to question {}", question.number),
                                answer.clone(),
                                70.,
                            )),
                    );
                }
                if data.questions().is_empty() {
                    body = body.child(modal::body(
                        "No open questions. Add a note to request another Grill round.",
                    ));
                }
                body = body.child(input::form_field(
                    "Note for the next Grill round",
                    panel.note.clone(),
                    100.,
                ));
            }
        }
        if let Some(error) = &panel.error {
            body = body.child(
                div()
                    .id("board-owner-error")
                    .debug_selector(|| "board-owner-error".into())
                    .role(Role::Alert)
                    .text_size(px(12.))
                    .child(error.clone()),
            );
        }
        let mut actions = modal::actions().child(
            modal::disabled(
                controls::ghost_button("board-owner-cancel", "Cancel"),
                panel.busy,
            )
            .track_focus(&panel.cancel_focus)
            .border_1()
            .border_color(content(0.))
            .focus_visible(|s| s.border_color(accent_color()))
            .on_click(cx.listener(|this, _, window, cx| this.close_owner_review(window, cx))),
        );
        if panel.data.is_none() && !panel.loading {
            actions = actions.child(
                controls::primary_button("board-owner-retry-load", "Retry loading")
                    .cursor_pointer()
                    .debug_selector(|| "board-owner-retry-load".into())
                    .track_focus(&panel.submit_focus)
                    .border_1()
                    .border_color(content(0.))
                    .focus_visible(|s| s.border_color(accent_color()))
                    .on_click(cx.listener(|this, _, _, cx| this.load_owner_review(cx))),
            );
        }
        if panel.reload_required {
            actions = actions.child(
                modal::disabled(
                    controls::ghost_button("board-owner-reload", "Reload (discard draft)"),
                    panel.loading,
                )
                .debug_selector(|| "board-owner-reload".into())
                .track_focus(&panel.reload_focus)
                .border_1()
                .border_color(content(0.))
                .focus_visible(|s| s.border_color(accent_color()))
                .on_click(cx.listener(|this, _, _, cx| this.load_owner_review(cx))),
            );
        }
        if panel.data.is_some() {
            let has_questions = panel.mode == Mode::Questions && !panel.answers.is_empty();
            if has_questions {
                actions = actions.child(
                    modal::disabled(
                        controls::ghost_button("board-owner-changes", "Request changes"),
                        !panel.can_submit(true, cx),
                    )
                    .track_focus(&panel.changes_focus)
                    .border_1()
                    .border_color(content(0.))
                    .focus_visible(|s| s.border_color(accent_color()))
                    .on_click(cx.listener(|this, _, _, cx| this.submit_owner_review(true, cx))),
                );
            }
            let label = if panel.busy {
                "Saving…"
            } else if panel.mode == Mode::Plan {
                "Save as new version"
            } else if panel.mode == Mode::Rework {
                "Start rework"
            } else if has_questions {
                "Answer & re-grill"
            } else {
                "Request changes"
            };
            actions = actions.child(
                modal::disabled(
                    controls::primary_button("board-owner-submit", label),
                    !panel.can_submit(false, cx),
                )
                .debug_selector(|| "board-owner-submit".into())
                .track_focus(&panel.submit_focus)
                .border_1()
                .border_color(content(0.))
                .focus_visible(|s| s.border_color(accent_color()))
                .on_click(cx.listener(|this, _, _, cx| this.submit_owner_review(false, cx))),
            );
        }
        body = body.child(actions);
        let card = modal::card()
            .bg(crate::theme::floating_fill())
            .w(px(720.))
            .max_w_full()
            .max_h_full()
            .id("board-owner-dialog")
            .debug_selector(|| "board-owner-dialog".into())
            .role(Role::Dialog)
            .aria_label(title)
            .track_focus(&panel.focus)
            .on_key_down(cx.listener(Self::owner_review_key))
            .child(body);
        let weak = cx.weak_entity();
        Some(
            modal::window_overlay(
                window,
                modal::overlay("board-owner-review", card, move |window, cx| {
                    let _ = weak.update(cx, |this, cx| this.close_owner_review(window, cx));
                }),
            )
            .into_any_element(),
        )
    }
}
