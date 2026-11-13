use super::{Event, Home, layout::model::EDIT_MIN_WIDTH};
use crate::{modal, task_board::controls, theme::*};
use gpui::{Context, FontWeight, Render, Role, Window, div, prelude::*, px};

pub(super) const PAGE_PADDING: f32 = 16.;

impl Render for Home {
    fn render(&mut self, window: &mut Window, cx: &mut Context<Self>) -> impl IntoElement {
        let width = self.frame.get().map_or(
            window.viewport_size().width.to_f64() as f32 - PAGE_PADDING * 2.,
            |bounds| bounds.size.width.to_f64() as f32,
        );
        let wide = width >= EDIT_MIN_WIDTH;
        if !wide && self.editing {
            self.editing = false;
            self.views.sphere_motion.borrow_mut().set_editing(false);
            self.views.brand.update(cx, |_, cx| cx.notify());
            self.drag = None;
        }
        let items = if wide {
            self.state.visible()
        } else {
            self.state.narrow()
        };

        let grid = self.grid(&items, width, window, cx);
        let header = self.header(wide, cx);
        let hidden = (self.editing && !self.state.hidden.is_empty()).then(|| self.hidden_strip(cx));
        let sheet = self.consumption_sheet(window, cx);

        div()
            .id("home")
            .debug_selector(|| "home".into())
            .role(Role::Region)
            .aria_label("Home")
            .track_focus(&self.focus)
            .size_full()
            .min_h_0()
            .flex()
            .flex_col()
            .text_color(content(1.))
            .on_mouse_move(cx.listener(|this, event: &gpui::MouseMoveEvent, _, cx| {
                if this.drag.is_some() {
                    if event.pressed_button == Some(gpui::MouseButton::Left) {
                        this.drag_to(event.position, cx);
                    } else {
                        this.end_drag(cx);
                    }
                }
            }))
            .on_mouse_up(
                gpui::MouseButton::Left,
                cx.listener(|this, _, _, cx| this.end_drag(cx)),
            )
            .on_mouse_up_out(
                gpui::MouseButton::Left,
                cx.listener(|this, _, _, cx| this.end_drag(cx)),
            )
            .on_key_down(cx.listener(|this, event: &gpui::KeyDownEvent, _, cx| {
                if event.keystroke.key != "escape" {
                    return;
                }
                if this.feeds.consumption.sheet_open {
                    this.set_consumption_sheet(false, cx);
                } else if !this.cancel_drag(cx) {
                    if this.editing {
                        this.finish_editing(cx);
                    } else {
                        cx.emit(Event::Close);
                    }
                }
                cx.stop_propagation();
            }))
            .child(header)
            .children(hidden)
            .child(
                div()
                    .id("home-scroll")
                    .flex_1()
                    .min_h_0()
                    .overflow_y_scroll()
                    .p(px(PAGE_PADDING))
                    .child(grid),
            )
            .children(sheet)
    }
}

impl Home {
    fn header(&self, wide: bool, cx: &mut Context<Self>) -> gpui::Div {
        let actions = if self.editing {
            div()
                .flex()
                .gap_1p5()
                .child(
                    header_button("home-layout-reset", "Reset")
                        .on_click(cx.listener(|this, _, _, cx| this.reset_layout(cx))),
                )
                .child(
                    header_button("home-layout-done", "Done")
                        .on_click(cx.listener(|this, _, _, cx| this.finish_editing(cx))),
                )
        } else {
            div().child(modal::disabled(
                header_button("home-layout-edit", "Edit layout")
                    .when(!wide, |button| {
                        button.tooltip(|_, cx| {
                            controls::hint("Widen the window to edit the layout", cx)
                        })
                    })
                    .on_click(cx.listener(|this, _, _, cx| this.start_editing(cx))),
                !wide,
            ))
        };

        div()
            .h(px(40.))
            .flex_shrink_0()
            .px_3()
            .flex()
            .items_center()
            .justify_between()
            .border_b_1()
            .border_color(content(0.08))
            .child(
                div()
                    .flex()
                    .items_center()
                    .gap_2()
                    .text_size(px(12.))
                    .font_weight(FontWeight::SEMIBOLD)
                    .child(icon("home", 14.).text_color(content(0.6)))
                    .child("Home"),
            )
            .child(actions)
    }
}

fn header_button(id: &'static str, label: &'static str) -> gpui::Stateful<gpui::Div> {
    controls::ghost_button(id, label).debug_selector(move || id.into())
}
