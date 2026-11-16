use super::{Board, Event};
use crate::task_board::controls;
use crate::theme::*;
use gpui::{Context, FontWeight, Render, Role, Window, div, prelude::*, px};

impl Render for Board {
    fn render(&mut self, window: &mut Window, cx: &mut Context<Self>) -> impl IntoElement {
        if self.dragging.is_some() && !cx.has_active_drag() {
            self.dragging = None;
            self.drag_over = None;
        }
        self.sync_detail_content(cx);
        let archived = self.archived;
        let overlay = self
            .review_overlay(window, cx)
            .or_else(|| self.editor_overlay(window, cx))
            .or_else(|| self.moves_overlay(window, cx))
            .or_else(|| self.creation_overlay(window, cx))
            .or_else(|| self.project_overlay(window, cx))
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
            .on_mouse_move(cx.listener(|this, event: &gpui::MouseMoveEvent, _, cx| {
                if event.pressed_button == Some(gpui::MouseButton::Left) {
                    this.drag_board_scrollbar(event.position.x, cx);
                }
            }))
            .on_mouse_up(
                gpui::MouseButton::Left,
                cx.listener(|this, _, _, cx| this.end_board_scrollbar(cx)),
            )
            .on_mouse_up_out(
                gpui::MouseButton::Left,
                cx.listener(|this, _, _, cx| this.end_board_scrollbar(cx)),
            )
            .on_key_down(cx.listener(|this, event: &gpui::KeyDownEvent, window, cx| {
                if this.create_open
                    || this.artifact.is_some()
                    || this.review.is_some()
                    || this.editor.is_some()
                    || this.move_menu.is_some()
                    || this.project_menu.is_some()
                    || this.settings.is_some()
                    || this.picker.is_some()
                {
                    return;
                }
                if event.keystroke.modifiers.platform || event.keystroke.modifiers.control {
                    return;
                }
                if event.keystroke.key == "escape" && this.cancel_drag(window, cx) {
                    cx.stop_propagation();
                    return;
                }
                if matches!(event.keystroke.key.as_str(), "enter" | "space")
                    && window.focused(cx).is_some_and(|focus| focus != this.focus)
                {
                    return;
                }
                match event.keystroke.key.as_str() {
                    "escape" if this.drawer_open => this.close_detail(cx),
                    "enter" => {
                        if let Some(id) = this.selected.clone() {
                            this.open_detail(id, cx);
                        }
                    }
                    "escape" => cx.emit(Event::Close),
                    "n" => this.open_create(window, cx),
                    "p" => {
                        this.project_only = !this.project_only;
                        this.project_filter = this.project_only.then(|| this.cwd.clone());
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
                    "left" => this.move_column(false, cx),
                    "right" => this.move_column(true, cx),
                    _ => return,
                }
                cx.stop_propagation();
            }))
            .child(
                div()
                    .min_h(px(40.))
                    .flex_wrap()
                    .py_1()
                    .text_size(px(12.))
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
                    .child(self.project_filter(cx))
                    .child(
                        div()
                            .id("board-archive-filter")
                            .role(Role::Button)
                            .aria_label("Archived cards")
                            .aria_keyshortcuts("A")
                            .tooltip(|_, cx| controls::hint("Toggle archived cards (A)", cx))
                            .aria_selected(archived)
                            .when(archived, |d| d.bg(content(0.08)))
                            .cursor_pointer()
                            .px_2()
                            .h(px(28.))
                            .flex()
                            .items_center()
                            .gap_2()
                            .border_1()
                            .border_color(content(0.08))
                            .rounded(px(6.))
                            .hover(|s| s.bg(content(0.08)))
                            .child(if archived { "Archived" } else { "Active" })
                            .on_click(cx.listener(|this, _, _, cx| {
                                this.archived = !this.archived;
                                this.snapshot = None;
                                this.refresh(cx);
                            })),
                    )
                    .child(self.attention_summary())
                    .child(div().flex_1())
                    .child(
                        controls::ghost_button("board-stage-settings", "Settings")
                            .debug_selector(|| "board-stage-settings".into())
                            .on_click(
                                cx.listener(|this, _, window, cx| this.open_settings(window, cx)),
                            ),
                    )
                    .child(
                        controls::primary_button("board-new-task", "New task")
                            .flex_row_reverse()
                            .gap_2()
                            .child(icon("plus", 14.).text_color(background_base()))
                            .aria_label("New task (N)")
                            .on_click(
                                cx.listener(|this, _, window, cx| this.open_create(window, cx)),
                            ),
                    )
                    .child(
                        icon_button("board-refresh", "Refresh Board (R)", "refresh")
                            .size(px(28.))
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
                |d| d.child(self.kanban(cx)),
            )
            .when_some(overlay, |board, overlay| board.child(overlay))
    }
}
