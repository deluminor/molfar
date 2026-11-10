use super::{
    super::Board,
    column::section,
    column_skills::selected_skills,
    skill_rows::{available_row, selected_row},
};
use crate::{task_board::controls, theme::*};
use gpui::{AnyElement, Context, Div, Role, div, prelude::*, px};
use molfar_core::task_board::stage::{agent::AgentStage, choice::settings::COLUMN_SKILLS};

const SKILL_LIST_MAX_HEIGHT: f32 = 184.;

impl Board {
    pub(super) fn column_skills(&self, stage: AgentStage, cx: &mut Context<Self>) -> AnyElement {
        let panel = self.settings.as_ref().expect("open settings");
        let selected = selected_skills(panel, stage);
        let automatic = panel
            .saved
            .as_ref()
            .and_then(|saved| saved.get(COLUMN_SKILLS))
            .and_then(|skills| skills.get(stage.id()))
            .is_none();

        let header = div()
            .flex()
            .items_center()
            .justify_between()
            .child(
                div()
                    .flex()
                    .items_center()
                    .gap_2()
                    .child(
                        div()
                            .text_size(px(11.))
                            .font_weight(gpui::FontWeight::MEDIUM)
                            .text_color(content(0.55))
                            .child("Skills"),
                    )
                    .when(!automatic, |title| {
                        title.child(
                            div()
                                .px_1p5()
                                .rounded_md()
                                .bg(content(0.07))
                                .text_size(px(10.))
                                .text_color(content(0.6))
                                .child(selected.len().to_string()),
                        )
                    }),
            )
            .when(!automatic, |header| {
                header.child(
                    controls::ghost_button("board-column-skills-auto", "Auto-detect")
                        .text_size(px(11.))
                        .text_color(content(0.5))
                        .aria_label(format!("Reset {} skills to auto-detect", stage.id()))
                        .on_click(
                            cx.listener(move |this, _, _, cx| this.reset_stage_skills(stage, cx)),
                        ),
                )
            });

        let mut list = div()
            .id("board-column-skills-list")
            .flex()
            .flex_col()
            .gap_1();
        for name in &selected {
            list = list.child(selected_row(stage, name, cx));
        }

        let note = match (automatic, selected.is_empty()) {
            (true, _) => Some("Auto-detected for each card. Add a skill to pin a custom list."),
            (false, true) => Some("No skills. Cards in this column run without extra skills."),
            (false, false) => None,
        };

        div()
            .flex()
            .flex_col()
            .gap_2()
            .pt_3()
            .border_t_1()
            .border_color(content(0.08))
            .child(header)
            .when_some(note, |section, note| {
                section.child(
                    div()
                        .text_size(px(11.))
                        .text_color(content(0.5))
                        .child(note),
                )
            })
            .when(!selected.is_empty(), |section| section.child(list))
            .when_some(panel.catalog_error.clone(), |section, error| {
                section.child(
                    div()
                        .id("board-column-skills-error")
                        .role(Role::Alert)
                        .text_size(px(11.))
                        .child(error),
                )
            })
            .child(if panel.adding_skills {
                self.skill_adder(stage, &selected, cx).into_any_element()
            } else {
                controls::ghost_button("board-column-skills-add", "Add skill")
                    .self_start()
                    .gap_1p5()
                    .debug_selector(|| "board-column-skills-add".into())
                    .child(icon("plus", 12.))
                    .on_click(cx.listener(|this, _, window, cx| this.open_skill_adder(window, cx)))
                    .into_any_element()
            })
            .into_any_element()
    }

    fn skill_adder(&self, stage: AgentStage, selected: &[String], cx: &mut Context<Self>) -> Div {
        let panel = self.settings.as_ref().expect("open settings");
        let query = panel.skill_search.read(cx).content.to_lowercase();
        let unselected: Vec<&String> = panel
            .catalog
            .iter()
            .filter(|name| !selected.contains(name))
            .collect();
        let empty = if unselected.is_empty() {
            "All available skills are added."
        } else {
            "No matching skills."
        };
        let available: Vec<&String> = unselected
            .into_iter()
            .filter(|name| name.to_lowercase().contains(&query))
            .collect();

        let mut rows = div()
            .id("board-column-skills-available")
            .max_h(px(SKILL_LIST_MAX_HEIGHT))
            .overflow_y_scroll()
            .flex()
            .flex_col()
            .p_1();
        for name in available.iter().copied() {
            rows = rows.child(available_row(stage, name, cx));
        }

        section("Add skills")
            .p_2()
            .rounded(px(12.))
            .bg(content(0.03))
            .child(
                div()
                    .flex()
                    .items_center()
                    .gap_2()
                    .px_2()
                    .h(px(28.))
                    .rounded_md()
                    .bg(content(0.05))
                    .child(icon("search", 12.).text_color(content(0.45)))
                    .child(div().flex_1().min_w_0().child(panel.skill_search.clone())),
            )
            .child(if available.is_empty() {
                div()
                    .px_1()
                    .py_2()
                    .text_size(px(11.))
                    .text_color(content(0.5))
                    .child(empty)
                    .into_any_element()
            } else {
                rows.into_any_element()
            })
            .child(
                controls::ghost_button("board-column-skills-done", "Done")
                    .self_end()
                    .on_click(
                        cx.listener(|this, _, window, cx| this.close_skill_adder(window, cx)),
                    ),
            )
    }
}
