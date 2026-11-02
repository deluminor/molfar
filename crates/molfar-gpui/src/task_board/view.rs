use super::{Board, Event};
use crate::theme::*;
use gpui::{Context, FontWeight, Render, Role, Window, div, prelude::*, px};

impl Render for Board {
    fn render(&mut self, window: &mut Window, cx: &mut Context<Self>) -> impl IntoElement {
        let project_only = self.project_only;
        let archived = self.archived;
        let overlay = self
            .review_overlay(window, cx)
            .or_else(|| self.creation_overlay(window, cx))
            .or_else(|| self.artifact_overlay(window, cx))
            .or_else(|| self.settings_overlay(window, cx));
        div()
            .id("task-board")
            .debug_selector(|| "task-board".into())
            .role(Role::Region)
            .aria_label("Task Board")
            .track_focus(&self.focus)
            .size_full()
            .relative()
            .min_h_0()
            .flex()
            .flex_col()
            .text_color(content(1.))
            .on_key_down(cx.listener(|this, event: &gpui::KeyDownEvent, window, cx| {
                if this.create_open || this.artifact.is_some() || this.review.is_some() {
                    return;
                }
                if event.keystroke.modifiers.platform || event.keystroke.modifiers.control {
                    return;
                }
                match event.keystroke.key.as_str() {
                    "escape" => cx.emit(Event::Close),
                    "n" => this.open_create(window, cx),
                    "p" => {
                        this.project_only = !this.project_only;
                        this.snapshot = None;
                        this.refresh(cx);
                    }
                    "a" => {
                        this.archived = !this.archived;
                        this.snapshot = None;
                        this.refresh(cx);
                    }
                    "r" => this.refresh(cx),
                    "up" => this.move_selection(false, cx),
                    "down" => this.move_selection(true, cx),
                    _ => return,
                }
                cx.stop_propagation();
            }))
            .child(
                div()
                    .h(px(44.))
                    .flex_shrink_0()
                    .px_3()
                    .flex()
                    .items_center()
                    .gap_2()
                    .border_b_1()
                    .border_color(content(0.08))
                    .child(div().font_weight(FontWeight::SEMIBOLD).child("Board"))
                    .when(self.loading && self.snapshot.is_some(), |header| {
                        header.child(
                            div()
                                .id("board-refreshing")
                                .text_size(px(12.))
                                .text_color(content(0.6))
                                .child("Refreshing…"),
                        )
                    })
                    .child(
                        div()
                            .id("board-project-filter")
                            .role(Role::Button)
                            .aria_label("Current project only")
                            .aria_selected(project_only)
                            .cursor_pointer()
                            .px_2()
                            .py_1()
                            .rounded_md()
                            .hover(|s| s.bg(content(0.08)))
                            .child(if project_only {
                                "Current project (P)"
                            } else {
                                "All projects (P)"
                            })
                            .on_click(cx.listener(|this, _, _, cx| {
                                this.project_only = !this.project_only;
                                this.snapshot = None;
                                this.refresh(cx);
                            })),
                    )
                    .child(
                        div()
                            .id("board-archive-filter")
                            .role(Role::Button)
                            .aria_label("Archived cards")
                            .aria_selected(archived)
                            .cursor_pointer()
                            .px_2()
                            .py_1()
                            .rounded_md()
                            .hover(|s| s.bg(content(0.08)))
                            .child(if archived {
                                "Archived (A)"
                            } else {
                                "Active (A)"
                            })
                            .on_click(cx.listener(|this, _, _, cx| {
                                this.archived = !this.archived;
                                this.snapshot = None;
                                this.refresh(cx);
                            })),
                    )
                    .child(div().flex_1())
                    .child(
                        crate::modal::ghost_button("board-stage-settings", "Stage settings")
                            .debug_selector(|| "board-stage-settings".into())
                            .on_click(
                                cx.listener(|this, _, window, cx| this.open_settings(window, cx)),
                            ),
                    )
                    .child(
                        crate::modal::primary_button("board-new-task", "New task")
                            .aria_label("New task (N)")
                            .on_click(
                                cx.listener(|this, _, window, cx| this.open_create(window, cx)),
                            ),
                    )
                    .child(
                        icon_button("board-refresh", "Refresh Board (R)", "refresh")
                            .on_click(cx.listener(|this, _, _, cx| this.refresh(cx))),
                    ),
            )
            .when(self.loading && self.snapshot.is_none(), |d| {
                d.child(div().id("board-loading").p_3().child("Loading Board…"))
            })
            .when_some(self.error.clone(), |d, error| {
                d.child(
                    div()
                        .id("board-error")
                        .debug_selector(|| "board-error".into())
                        .p_3()
                        .child(error)
                        .child(
                            div().mt_2().child(
                                icon_button("board-retry", "Retry Board", "refresh")
                                    .on_click(cx.listener(|this, _, _, cx| this.refresh(cx))),
                            ),
                        ),
                )
            })
            .when(
                self.snapshot.is_some() || (!self.loading && self.error.is_none()),
                |d| {
                    d.child(
                        div()
                            .flex_1()
                            .min_h_0()
                            .flex()
                            .child(self.list(cx))
                            .child(self.detail(cx)),
                    )
                },
            )
            .when_some(overlay, |board, overlay| board.child(overlay))
    }
}
