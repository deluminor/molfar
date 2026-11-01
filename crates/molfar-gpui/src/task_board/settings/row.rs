use super::{super::Board, Panel, PickTarget, modes, stage_label};
use crate::{modal, theme::*};
use gpui::{Context, Div, SharedString, div, prelude::*};
use molfar_core::task_board::stage::{
    agent::AgentStage,
    choice::settings::{HARNESS, MODEL, RUNTIME_MODE},
};

fn id(parts: &[&str]) -> SharedString {
    SharedString::from(format!("board-settings-{}", parts.join("-")))
}

impl Board {
    pub(super) fn stage_row(
        &self,
        panel: &Panel,
        stage: AgentStage,
        cx: &mut Context<Self>,
    ) -> Div {
        let column = panel.column(stage);
        let configured = column.is_some();
        let mode = column
            .and_then(|config| config[RUNTIME_MODE].as_str())
            .unwrap_or_default()
            .to_owned();
        let summary = column.map_or("Project default model".to_owned(), |config| {
            format!(
                "{} · {}",
                config[HARNESS].as_str().unwrap_or_default(),
                config[MODEL].as_str().unwrap_or_default()
            )
        });
        let anchor = panel.anchor(stage);
        let name = stage_label(stage);
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
                    button
                        .aria_label(format!("{label} access for {name}"))
                        .aria_selected(value == mode)
                        .debug_selector(move || {
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
                            .aria_label(format!("Change model for {name}"))
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
                            modal::ghost_button(id(&[stage.id(), "default"]), "Use default")
                                .aria_label(format!("Use default for {name}")),
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
                                .aria_label(format!("Save skills for {name}"))
                                .debug_selector(move || {
                                    format!("board-settings-{}-skills-save", stage.id())
                                })
                                .on_click(cx.listener(move |this, _, _, cx| {
                                    this.save_stage_skills(stage, cx)
                                })),
                        )
                        .child(
                            modal::ghost_button(id(&[stage.id(), "skills", "auto"]), "Auto")
                                .aria_label(format!("Use automatic skills for {name}"))
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
}
