use super::super::Board;
use crate::modal;
use crate::popover::{Anchor, popover};
use gpui::{AnyElement, Context, Role, Window, div, prelude::*, px};
use molfar_core::task_board::stage::agent::AgentStage;

impl Board {
    fn picker_popover(&self, cx: &mut Context<Self>) -> Option<AnyElement> {
        let picker = self.picker.as_ref()?;
        let weak = cx.weak_entity();
        Some(
            popover("board-model-picker", Anchor::Slot(picker.anchor.clone()))
                .width(340.)
                .on_dismiss(move |window, cx| {
                    let _ = weak.update(cx, |this, cx| {
                        this.picker = None;
                        let focus = this
                            .settings
                            .as_ref()
                            .map_or(this.focus.clone(), |panel| panel.focus.clone());
                        window.focus(&focus, cx);
                        cx.notify();
                    });
                })
                .child(div().h(px(440.)).child(picker.list.clone()))
                .into_any_element(),
        )
    }

    pub(in crate::task_board) fn settings_overlay(
        &self,
        window: &Window,
        cx: &mut Context<Self>,
    ) -> Option<AnyElement> {
        let picker = self.picker_popover(cx);
        let Some(panel) = &self.settings else {
            let overlay = div().absolute().inset_0().child(picker?);
            return Some(modal::window_overlay(window, overlay).into_any_element());
        };

        let mut body = modal::card_body()
            .id("board-settings-body")
            .gap_2()
            .max_h_full()
            .overflow_y_scroll()
            .child(modal::title("Stage settings"))
            .child(modal::body("Each stage uses its saved model, access and skills. Running stages keep the choice they started with."));
        if let Some(error) = panel.error.clone() {
            body = body.child(
                div()
                    .id("board-settings-error")
                    .debug_selector(|| "board-settings-error".into())
                    .role(Role::Alert)
                    .text_size(px(12.))
                    .child(error),
            );
        }
        if panel.saved.is_none() && panel.error.is_none() {
            body = body.child("Loading settings…");
        }
        if panel.saved.is_some() {
            for stage in AgentStage::ALL {
                body = body.child(self.stage_row(panel, stage, cx));
            }
            body = body.child(
                div()
                    .flex()
                    .items_end()
                    .gap_2()
                    .pt_2()
                    .child(div().flex_1().child(crate::input::form_field(
                        "Concurrent stages (1–10)",
                        panel.concurrency.clone(),
                        32.,
                    )))
                    .child(div().flex_1().child(crate::input::form_field(
                        "Stall notice after minutes (1–1440)",
                        panel.stall.clone(),
                        32.,
                    )))
                    .child(
                        modal::ghost_button("board-settings-limits-save", "Save limits")
                            .debug_selector(|| "board-settings-limits-save".into())
                            .on_click(cx.listener(|this, _, _, cx| this.save_limits(cx))),
                    ),
            );
        }
        let body = body.child(
            modal::actions().child(
                modal::primary_button("board-settings-close", "Close")
                    .on_click(cx.listener(|this, _, window, cx| this.close_settings(window, cx))),
            ),
        );

        let card = modal::card()
            .w(px(720.))
            .max_w_full()
            .max_h_full()
            .id("board-settings-dialog")
            .debug_selector(|| "board-settings-dialog".into())
            .role(Role::Dialog)
            .aria_label("Stage settings")
            .track_focus(&panel.focus)
            .on_key_down(cx.listener(|this, event: &gpui::KeyDownEvent, window, cx| {
                if event.keystroke.key == "escape" {
                    this.close_settings(window, cx);
                    cx.stop_propagation();
                }
            }))
            .child(body);
        let weak = cx.weak_entity();
        let overlay = div()
            .absolute()
            .inset_0()
            .child(modal::overlay("board-settings", card, move |window, cx| {
                let _ = weak.update(cx, |this, cx| this.close_settings(window, cx));
            }))
            .when_some(picker, |overlay, picker| overlay.child(picker));
        Some(modal::window_overlay(window, overlay).into_any_element())
    }
}
