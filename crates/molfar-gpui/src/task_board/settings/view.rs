use super::{super::Board, Panel, PickTarget, modes, stage_label};
use crate::popover::{Anchor, popover};
use crate::{modal, theme::*};
use gpui::{AnyElement, Context, Div, Role, SharedString, Window, div, prelude::*, px};
use molfar_core::task_board::stage::agent::AgentStage;

fn id(parts: &[&str]) -> SharedString {
    SharedString::from(format!("board-settings-{}", parts.join("-")))
}

impl Board {
    fn stage_row(&self, panel: &Panel, stage: AgentStage, cx: &mut Context<Self>) -> Div {
        let column = panel.column(stage);
        let configured = column.is_some();
        let mode = column
            .and_then(|config| config["runtimeMode"].as_str())
            .unwrap_or_default()
            .to_owned();
        let summary = column.map_or("Project default model".to_owned(), |config| {
            format!(
                "{} · {}",
                config["harness"].as_str().unwrap_or_default(),
                config["model"].as_str().unwrap_or_default()
            )
        });
        let anchor = panel.anchor(stage);
        let skills = panel
            .skills
            .iter()
            .find(|(entry, _)| *entry == stage)
            .map(|(_, input)| input.clone());

        let mut modes_row = div().flex().flex_wrap().gap_1();
        for (value, label) in modes() {
            let button = if value == mode {
                modal::primary_button(id(&[stage.id(), "mode", value]), label)
            } else {
                modal::ghost_button(id(&[stage.id(), "mode", value]), label)
            };
            modes_row = modes_row.child(
                modal::disabled(
                    button.debug_selector(move || {
                        format!("board-settings-{}-mode-{value}", stage.id())
                    }),
                    !configured,
                )
                .on_click(cx.listener(move |this, _, _, cx| this.set_stage_mode(stage, value, cx))),
            );
        }

        div()
            .flex()
            .flex_col()
            .gap_2()
            .py_2()
            .border_b_1()
            .border_color(content(0.08))
            .child(
                div()
                    .flex()
                    .items_center()
                    .gap_2()
                    .child(
                        div()
                            .font_weight(gpui::FontWeight::SEMIBOLD)
                            .child(stage_label(stage)),
                    )
                    .child(
                        div()
                            .flex_1()
                            .min_w_0()
                            .truncate()
                            .text_color(content(0.65))
                            .child(summary),
                    )
                    .child(anchor.probe())
                    .child(
                        modal::ghost_button(id(&[stage.id(), "model"]), "Change model")
                            .debug_selector(move || format!("board-settings-{}-model", stage.id()))
                            .on_click(cx.listener(move |this, _, window, cx| {
                                this.open_model_picker(
                                    PickTarget::Column(stage),
                                    anchor.clone(),
                                    window,
                                    cx,
                                )
                            })),
                    )
                    .child(
                        modal::disabled(
                            modal::ghost_button(id(&[stage.id(), "default"]), "Use default"),
                            !configured,
                        )
                        .on_click(
                            cx.listener(move |this, _, _, cx| this.reset_stage_model(stage, cx)),
                        ),
                    ),
            )
            .child(modes_row)
            .when_some(skills, |row, input| {
                row.child(
                    div()
                        .flex()
                        .items_end()
                        .gap_2()
                        .child(div().flex_1().child(crate::input::form_field(
                            "Skills (auto when empty)",
                            input,
                            32.,
                        )))
                        .child(
                            modal::ghost_button(id(&[stage.id(), "skills", "save"]), "Save skills")
                                .debug_selector(move || {
                                    format!("board-settings-{}-skills-save", stage.id())
                                })
                                .on_click(cx.listener(move |this, _, _, cx| {
                                    this.save_stage_skills(stage, cx)
                                })),
                        )
                        .child(
                            modal::ghost_button(id(&[stage.id(), "skills", "auto"]), "Auto")
                                .debug_selector(move || {
                                    format!("board-settings-{}-skills-auto", stage.id())
                                })
                                .on_click(cx.listener(move |this, _, _, cx| {
                                    this.reset_stage_skills(stage, cx)
                                })),
                        ),
                )
            })
    }

    fn picker_popover(&self, cx: &mut Context<Self>) -> Option<AnyElement> {
        let picker = self.picker.as_ref()?;
        let weak = cx.weak_entity();
        Some(
            popover("board-model-picker", Anchor::Slot(picker.anchor.clone()))
                .width(340.)
                .on_dismiss(move |_, cx| {
                    let _ = weak.update(cx, |this, cx| {
                        this.picker = None;
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
                }
                cx.stop_propagation();
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
