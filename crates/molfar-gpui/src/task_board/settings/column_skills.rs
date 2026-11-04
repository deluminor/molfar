use super::{super::Board, Panel};
use crate::{task_board::controls, theme::*};
use gpui::{AnyElement, Context, Role, SharedString, Toggled, div, prelude::*, px};
use molfar_core::task_board::stage::{
    agent::AgentStage,
    choice::settings::{COLUMN_SKILLS, SettingsPatch},
};

impl Board {
    pub(super) fn load_column_skills(&mut self, stage: AgentStage, cx: &mut Context<Self>) {
        let Some(panel) = &self.settings else {
            return;
        };
        let focus = panel.focus.clone();
        let cwd = self.cwd.clone();
        let disabled = cx
            .try_global::<crate::settings::Preferences>()
            .map(|prefs| prefs.disabled_skill_paths.clone())
            .unwrap_or_default();
        let work = cx.background_executor().spawn(async move {
            molfar_core::skills::list_skills(cwd, Some(disabled)).map(|skills| {
                skills
                    .into_iter()
                    .map(|skill| skill.name)
                    .collect::<Vec<_>>()
            })
        });
        cx.spawn(async move |this, cx| {
            let result = work.await;
            let _ = this.update(cx, |this, cx| {
                this.finish_column_skills(stage, &focus, result, cx)
            });
        })
        .detach();
    }

    pub(super) fn finish_column_skills(
        &mut self,
        stage: AgentStage,
        focus: &gpui::FocusHandle,
        result: Result<Vec<String>, String>,
        cx: &mut Context<Self>,
    ) {
        let Some(panel) = &mut self.settings else {
            return;
        };
        if panel.column != Some(stage) || panel.focus != *focus {
            return;
        }
        match result {
            Ok(mut catalog) => {
                catalog.sort();
                catalog.dedup();
                panel.catalog = catalog;
            }
            Err(error) => panel.catalog_error = Some(format!("Skill catalog unavailable: {error}")),
        }
        cx.notify();
    }

    pub(super) fn toggle_column_skill(
        &mut self,
        stage: AgentStage,
        name: &str,
        cx: &mut Context<Self>,
    ) {
        let Some(panel) = &self.settings else {
            return;
        };
        if panel.saved.is_none() || panel.pending.is_some() {
            return;
        }
        let mut selected = selected_skills(panel, stage);
        if selected.iter().any(|entry| entry == name) {
            selected.retain(|entry| entry != name);
        } else {
            selected.push(name.to_owned());
        }
        if let Some((_, input)) = panel.skills.iter().find(|(entry, _)| *entry == stage) {
            input.update(cx, |input, cx| input.set_text(selected.join(", "), cx));
        }
        self.emit_settings(SettingsPatch::ColumnSkills(stage, Some(selected)), cx);
    }

    pub(super) fn column_skills(&self, stage: AgentStage, cx: &mut Context<Self>) -> AnyElement {
        let panel = self.settings.as_ref().expect("open settings");
        let selected = selected_skills(panel, stage);
        let automatic = panel
            .saved
            .as_ref()
            .and_then(|saved| saved.get(COLUMN_SKILLS))
            .and_then(|skills| skills.get(stage.id()))
            .is_none();
        let mut names = panel.catalog.clone();
        names.extend(selected.clone());
        names.sort();
        names.dedup();
        let mut rows = div()
            .id("board-column-skills-list")
            .max_h(px(180.))
            .overflow_y_scroll()
            .flex()
            .flex_col()
            .gap_1();
        for name in names {
            let checked = selected.contains(&name);
            let click_name = name.clone();
            let key_name = name.clone();
            let selector = format!("board-column-skill-{name}");
            rows = rows.child(
                div()
                    .id(SharedString::from(selector.clone()))
                    .debug_selector(move || selector.clone())
                    .role(Role::CheckBox)
                    .aria_label(format!("Use {name}"))
                    .aria_toggled(if checked {
                        Toggled::True
                    } else {
                        Toggled::False
                    })
                    .focusable()
                    .tab_index(0)
                    .cursor_pointer()
                    .rounded_md()
                    .px_1()
                    .h(px(28.))
                    .flex()
                    .items_center()
                    .gap_2()
                    .text_color(content(0.8))
                    .hover(|style| style.bg(content(0.06)))
                    .focus_visible(|style| style.bg(content(0.08)))
                    .child(
                        icon(if checked { "check" } else { "square" }, 14.).text_color(
                            if checked {
                                accent_color()
                            } else {
                                content(0.4)
                            },
                        ),
                    )
                    .child(div().min_w_0().truncate().child(format!("/{name}")))
                    .on_click(cx.listener(move |this, _, _, cx| {
                        this.toggle_column_skill(stage, &click_name, cx)
                    }))
                    .on_key_down(cx.listener(move |this, event: &gpui::KeyDownEvent, _, cx| {
                        if matches!(event.keystroke.key.as_str(), "space" | "enter") {
                            this.toggle_column_skill(stage, &key_name, cx);
                            cx.stop_propagation();
                        }
                    })),
            );
        }
        let mut section = div()
            .flex()
            .flex_col()
            .gap_2()
            .pt_3()
            .border_t_1()
            .border_color(content(0.08))
            .child(div().font_weight(gpui::FontWeight::MEDIUM).child("Skills"))
            .child(
                div()
                    .text_size(px(11.))
                    .text_color(content(0.5))
                    .child(if automatic {
                        "Auto-detected for this stage until customized."
                    } else {
                        "Custom list for every card in this column."
                    }),
            )
            .when_some(panel.catalog_error.clone(), |section, error| {
                section.child(
                    div()
                        .id("board-column-skills-error")
                        .role(Role::Alert)
                        .child(error),
                )
            })
            .child(rows);
        if let Some((_, input)) = panel.skills.iter().find(|(entry, _)| *entry == stage) {
            section = section.child(
                div()
                    .flex()
                    .items_center()
                    .gap_2()
                    .child(div().flex_1().min_w_0().child(input.clone()))
                    .child(
                        controls::ghost_button("board-column-skills-save", "Save list").on_click(
                            cx.listener(move |this, _, _, cx| this.save_stage_skills(stage, cx)),
                        ),
                    ),
            );
        }
        section
            .child(
                controls::ghost_button("board-column-skills-auto", "Reset skills to auto-detect")
                    .justify_start()
                    .text_color(content(0.5))
                    .on_click(
                        cx.listener(move |this, _, _, cx| this.reset_stage_skills(stage, cx)),
                    ),
            )
            .into_any_element()
    }
}

fn selected_skills(panel: &Panel, stage: AgentStage) -> Vec<String> {
    panel
        .saved
        .as_ref()
        .and_then(|saved| saved.get(COLUMN_SKILLS))
        .and_then(|skills| skills.get(stage.id()))
        .and_then(serde_json::Value::as_array)
        .map(|skills| {
            skills
                .iter()
                .filter_map(serde_json::Value::as_str)
                .map(str::to_owned)
                .collect()
        })
        .unwrap_or_default()
}
