use super::super::Board;
use crate::modal::{self, sheet};
use crate::popover::{Anchor, popover};
use crate::task_board::controls;
use gpui::{AnyElement, Context, Role, Window, div, prelude::*, px};
use molfar_core::task_board::stage::agent::AgentStage;

impl Board {
    fn picker_popover(&self, cx: &mut Context<Self>) -> Option<AnyElement> {
        let picker = self.picker.as_ref()?;
        let weak = cx.weak_entity();
        let surface = self
            .settings
            .as_ref()
            .map(|panel| panel.picker_surface.clone());
        Some(
            popover("board-model-picker", Anchor::Slot(picker.anchor.clone()))
                .width(340.)
                .when_some(surface, |picker, surface| picker.track(surface))
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
                .child(
                    div()
                        .id("board-picker-content")
                        .debug_selector(|| "board-picker-content".into())
                        .h(px(440.))
                        .on_key_down(cx.listener(|this, event: &gpui::KeyDownEvent, window, cx| {
                            if event.keystroke.key == "escape" {
                                this.picker = None;
                                let focus = this
                                    .settings
                                    .as_ref()
                                    .map_or(this.focus.clone(), |panel| panel.focus.clone());
                                window.focus(&focus, cx);
                                cx.notify();
                                cx.stop_propagation();
                            }
                        }))
                        .child(picker.list.clone()),
                )
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

        if let Some(stage) = panel.column {
            return Some(self.column_settings_overlay(stage, picker, window, cx));
        }

        let mut body = sheet::body("board-settings-body").gap(px(4.));
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
                sheet::group()
                    .mt(px(8.))
                    .flex()
                    .items_end()
                    .gap_2()
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
                        controls::ghost_button("board-settings-limits-save", "Save limits")
                            .debug_selector(|| "board-settings-limits-save".into())
                            .on_click(cx.listener(|this, _, _, cx| this.save_limits(cx))),
                    ),
            );
        }
        let footer = sheet::footer().child(
            controls::ghost_button("board-settings-close", "Done")
                .on_click(cx.listener(|this, _, window, cx| this.close_settings(window, cx))),
        );

        let card = sheet::sheet(720.)
            .bg(crate::theme::floating_fill())
            .max_h((window.viewport_size().height - px(40.)).max(px(120.)))
            .id("board-settings-dialog")
            .debug_selector(|| "board-settings-dialog".into())
            .role(Role::Dialog)
            .aria_label("Stage settings")
            .track_focus(&panel.focus)
            .on_key_down(cx.listener(|this, event: &gpui::KeyDownEvent, window, cx| {
                if event.keystroke.key == "escape" {
                    if this.picker.is_some() {
                        this.picker = None;
                        if let Some(panel) = &this.settings { window.focus(&panel.focus, cx); }
                        cx.notify();
                    } else { this.close_settings(window, cx); }
                    cx.stop_propagation();
                }
            }))
            .child(sheet::header(
                "Stage settings",
                Some("Models, access and skills save per stage. Running stages keep their original settings.".into()),
            ))
            .child(body).child(footer);
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
