use super::{super::Board, Panel};
use gpui::{Context, Focusable, Window};
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

    pub(super) fn open_skill_adder(&mut self, window: &mut Window, cx: &mut Context<Self>) {
        let Some(panel) = &mut self.settings else {
            return;
        };
        panel.adding_skills = true;
        let search = panel.skill_search.clone();
        search.update(cx, |input, cx| input.set_text(String::new(), cx));
        window.focus(&search.focus_handle(cx), cx);
        cx.notify();
    }

    pub(super) fn close_skill_adder(&mut self, window: &mut Window, cx: &mut Context<Self>) {
        let Some(panel) = &mut self.settings else {
            return;
        };
        panel.adding_skills = false;
        window.focus(&panel.focus, cx);
        cx.notify();
    }
}

pub(super) fn selected_skills(panel: &Panel, stage: AgentStage) -> Vec<String> {
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
