use super::{super::Board, Panel, PickTarget, modes, stage_label};
use crate::task_board::controls;
use crate::{modal, theme::*};
use gpui::{Context, Div, SharedString, div, prelude::*, px};
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
        let model_hint = summary.clone();
        let anchor = panel.anchor(stage);
        let name = stage_label(stage);
        let skills = panel
            .skills
            .iter()
            .find(|(entry, _)| *entry == stage)
            .map(|(_, input)| input.clone());

        let mut modes_row = div()
            .flex()
            .flex_wrap()
            .gap_1()
            .p_1()
            .rounded_md()
            .bg(content(0.025));
        for (value, label) in modes() {
            let button = controls::ghost_button(id(&[stage.id(), "mode", value]), label)
                .h(px(28.))
                .px_2()
                .text_size(px(11.))
                .when(value == mode, |b| {
                    b.bg(content(0.1)).text_color(content(1.))
                });
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
            .p_3()
            .rounded_lg()
            .border_1()
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
                    .child(anchor.probe())
                    .child(
                        controls::ghost_button(id(&[stage.id(), "model"]), summary.clone())
                            .flex_1()
                            .min_w_0()
                            .flex_shrink(1.)
                            .truncate()
                            .aria_description(summary)
                            .tooltip(move |_, cx| controls::hint(model_hint.clone(), cx))
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
                            controls::ghost_button(id(&[stage.id(), "default"]), "Use default")
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
                            controls::ghost_button(id(&[stage.id(), "skills", "save"]), "Save")
                                .aria_label(format!("Save skills for {name}"))
                                .debug_selector(move || {
                                    format!("board-settings-{}-skills-save", stage.id())
                                })
                                .on_click(cx.listener(move |this, _, _, cx| {
                                    this.save_stage_skills(stage, cx)
                                })),
                        )
                        .child(
                            controls::ghost_button(id(&[stage.id(), "skills", "auto"]), "Auto")
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
