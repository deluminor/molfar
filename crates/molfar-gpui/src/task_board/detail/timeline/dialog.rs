use super::Timeline;
use crate::modal;
use gpui::{AnyElement, Context, Role, Window, div, prelude::*, px};

impl Timeline {
    pub(super) fn open_dialog(&mut self, window: &mut Window, cx: &mut Context<Self>) {
        self.expanded = true;
        if let Some(focus) = &self.close_focus {
            window.focus(focus, cx);
        }
        cx.notify();
    }

    pub(super) fn close_dialog(&mut self, window: &mut Window, cx: &mut Context<Self>) {
        if !self.expanded {
            return;
        }
        self.expanded = false;
        self.selected_run = None;
        self.hovered_run = None;
        if let Some(focus) = &self.expand_focus {
            window.focus(focus, cx);
        }
        cx.notify();
    }

    pub(super) fn dialog(&self, window: &Window, cx: &mut Context<Self>) -> AnyElement {
        let size = window.viewport_size();
        let close = self.close_focus.as_ref().expect("dialog focus");
        let card = modal::sheet::sheet((f32::from(size.width) - 32.).clamp(240., 880.))
            .id("board-timeline-dialog")
            .debug_selector(|| "board-timeline-dialog".into())
            .role(Role::Dialog)
            .aria_label("Stage timeline")
            .h(px((f32::from(size.height) - 48.).max(64.)))
            .on_key_down(cx.listener(|this, event: &gpui::KeyDownEvent, window, cx| {
                if event.keystroke.key == "escape" {
                    this.close_dialog(window, cx);
                    cx.stop_propagation();
                } else if event.keystroke.key == "tab" {
                    let mut handles = vec![this.close_focus.as_ref().unwrap().clone()];
                    handles.extend(
                        this.runs
                            .iter()
                            .filter_map(|run| this.session_focus.get(&run.id).cloned()),
                    );
                    handles.extend(
                        this.runs
                            .iter()
                            .filter_map(|run| this.inspect_focus.get(&run.id).cloned()),
                    );
                    if this.selected_run.is_some() || this.hovered_run.is_some() {
                        handles.push(this.details_focus.as_ref().unwrap().clone());
                    }
                    this.hovered_run = None;
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
                    cx.notify();
                    cx.stop_propagation();
                } else if matches!(event.keystroke.key.as_str(), "pagedown" | "pageup")
                    && let Some(scroll) = &this.details_scroll
                {
                    let delta = if event.keystroke.key == "pagedown" {
                        -80.
                    } else {
                        80.
                    };
                    let offset = scroll.offset();
                    scroll.set_offset(gpui::point(offset.x, offset.y + px(delta)));
                    cx.notify();
                }
                cx.stop_propagation();
            }))
            .child(
                modal::sheet::header(
                    format!(
                        "{} · Stage timeline",
                        self.card
                            .as_ref()
                            .map_or("Task", |card| card.title.as_str())
                    ),
                    None,
                )
                .child(
                    modal::sheet::close_button("board-timeline-close")
                        .track_focus(close)
                        .tab_index(0)
                        .on_click(cx.listener(|this, _, window, cx| this.close_dialog(window, cx)))
                        .on_key_down(cx.listener(
                            |this, event: &gpui::KeyDownEvent, window, cx| {
                                if matches!(event.keystroke.key.as_str(), "enter" | "space") {
                                    this.close_dialog(window, cx);
                                    cx.stop_propagation();
                                }
                            },
                        )),
                ),
            )
            .child(modal::sheet::body("board-timeline-dialog-scroll").child(self.view(true, cx)))
            .child(
                div()
                    .id("board-timeline-inspection-scroll")
                    .track_focus(self.details_focus.as_ref().unwrap())
                    .track_scroll(self.details_scroll.as_ref().unwrap())
                    .tab_index(0)
                    .aria_label("Run inspection and selected details; Page Up and Page Down scroll")
                    .max_h(px(f32::from(size.height) * 0.4))
                    .overflow_y_scroll()
                    .child(self.inspection_panels(window)),
            );
        let weak = cx.weak_entity();
        let overlay = div()
            .id("board-timeline-backdrop")
            .debug_selector(|| "board-timeline-backdrop".into())
            .absolute()
            .inset_0()
            .occlude()
            .bg(modal::scrim_color())
            .flex()
            .items_center()
            .justify_center()
            .on_mouse_down(gpui::MouseButton::Left, move |_, window, cx| {
                let _ = weak.update(cx, |this, cx| this.close_dialog(window, cx));
            })
            .child(
                div()
                    .on_mouse_down(gpui::MouseButton::Left, |_, _, cx| cx.stop_propagation())
                    .child(card),
            );
        modal::window_overlay(window, overlay).into_any_element()
    }
}
