use crate::{notes::preview::Preview, task_board::controls, theme::*};
use gpui::{AnyElement, Context, Entity, FocusHandle, Render, Role, Window, div, prelude::*, px};

pub(super) const FOLD_HEIGHT: f32 = 240.;
pub(super) const FOLD_THRESHOLD: f32 = 304.;

pub(super) struct Fold {
    pub preview: Option<Entity<Preview>>,
    pub expanded: bool,
    height: f32,
    label: &'static str,
    focus: FocusHandle,
}

impl Fold {
    pub fn new(label: &'static str, cx: &mut Context<Self>) -> Self {
        Self {
            preview: None,
            expanded: false,
            height: 0.,
            label,
            focus: cx.focus_handle(),
        }
    }

    fn toggle(&mut self, cx: &mut Context<Self>) {
        self.expanded = !self.expanded;
        cx.notify();
    }
}

impl Render for Fold {
    fn render(&mut self, _: &mut Window, cx: &mut Context<Self>) -> impl IntoElement {
        let long = self.height > FOLD_THRESHOLD;
        let closed = long && !self.expanded;
        let label = self.label;
        let weak = cx.weak_entity();
        let body: AnyElement = div()
            .w_full()
            .min_w_0()
            .flex()
            .flex_col()
            .when_some(self.preview.clone(), |d, preview| d.child(preview))
            .when(self.preview.is_none(), |d| d.child("Loading document…"))
            .into_any_element();
        div()
            .w_full()
            .min_w_0()
            .flex()
            .flex_col()
            .gap_2()
            .child(
                div()
                    .w_full()
                    .min_w_0()
                    .overflow_hidden()
                    .when(closed, |d| d.max_h(px(FOLD_HEIGHT)))
                    .child(
                        div()
                            .w_full()
                            .min_w_0()
                            .flex_shrink_0()
                            .on_children_prepainted(move |bounds, _, cx| {
                                let height = bounds.first().map_or(0., |b| b.size.height.as_f32());
                                let weak = weak.clone();
                                cx.defer(move |cx| {
                                    let _ = weak.update(cx, |this, cx| {
                                        if (this.height - height).abs() > 0.5 {
                                            this.height = height;
                                            cx.notify();
                                        }
                                    });
                                });
                            })
                            .child(body),
                    ),
            )
            .when(long, |d| {
                d.child(
                    controls::ghost_button(
                        "fold-toggle",
                        if self.expanded {
                            "Show less"
                        } else {
                            "Show more"
                        },
                    )
                    .debug_selector(move || format!("board-{label}-toggle"))
                    .role(Role::Button)
                    .aria_label(format!(
                        "{} {}",
                        if self.expanded { "Collapse" } else { "Expand" },
                        self.label
                    ))
                    .aria_expanded(self.expanded)
                    .track_focus(&self.focus)
                    .border_1()
                    .border_color(content(0.08))
                    .focus_visible(|s| s.border_color(accent_color()))
                    .on_key_down(cx.listener(|this, event: &gpui::KeyDownEvent, _, cx| {
                        if matches!(event.keystroke.key.as_str(), "enter" | "space") {
                            this.toggle(cx);
                            cx.stop_propagation();
                        }
                    }))
                    .on_click(cx.listener(|this, _, _, cx| this.toggle(cx))),
                )
            })
    }
}

#[cfg(test)]
mod tests {
    use gpui::{TestAppContext, VisualTestContext};

    #[gpui::test]
    fn disclosure_accepts_keyboard_without_triggering_board_enter(cx: &mut TestAppContext) {
        let window = super::super::tests::show(cx, true);
        let visual = &mut VisualTestContext::from_window(window.into(), cx);
        visual.run_until_parked();
        window
            .update(visual, |board, window, cx| {
                let fold = board
                    .detail_content
                    .as_ref()
                    .unwrap()
                    .description_view
                    .clone();
                let focus = fold.read(cx).focus.clone();
                window.focus(&focus, cx);
            })
            .unwrap();
        visual.simulate_keystrokes("space");
        visual.run_until_parked();
        window
            .update(visual, |board, _, cx| {
                assert!(
                    board
                        .detail_content
                        .as_ref()
                        .unwrap()
                        .description_view
                        .read(cx)
                        .expanded
                );
            })
            .unwrap();
        visual.simulate_keystrokes("enter");
        visual.run_until_parked();
        window
            .update(visual, |board, _, cx| {
                assert!(
                    !board
                        .detail_content
                        .as_ref()
                        .unwrap()
                        .description_view
                        .read(cx)
                        .expanded
                );
                assert!(board.drawer_open);
            })
            .unwrap();
    }
}
