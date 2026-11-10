use super::super::Board;
use gpui::Context;
use molfar_core::task_board::stage::{
    choice::settings::{COLUMN_SKILLS, MAX_CONCURRENT, STALL_MINUTES, SettingsPatch},
    lifecycle::constants::{DEFAULT_CONCURRENCY, DEFAULT_STALL_MINUTES},
};
use serde_json::Value;

impl Board {
    pub(in crate::task_board) fn load_settings(&mut self, cx: &mut Context<Self>) {
        let Some(panel) = &self.settings else {
            return;
        };
        let focus = panel.focus.clone();
        let store = self.store.clone();
        let work = cx
            .background_executor()
            .spawn(async move { crate::runtime::locked(&store)?.board_settings_json() });
        cx.spawn(async move |this, cx| {
            let result = work.await;
            let _ = this.update(cx, |this, cx| this.finish_settings_load(&focus, result, cx));
        })
        .detach();
    }

    fn finish_settings_load(
        &mut self,
        focus: &gpui::FocusHandle,
        result: Result<Option<String>, String>,
        cx: &mut Context<Self>,
    ) {
        let Some(panel) = &mut self.settings else {
            return;
        };
        if panel.focus != *focus {
            return;
        }
        let parsed = result.and_then(|raw| {
            raw.map_or(Ok(Value::Object(Default::default())), |raw| {
                serde_json::from_str(&raw).map_err(|_| "Board settings are unreadable.".to_owned())
            })
        });
        let saved = match parsed {
            Ok(saved) => saved,
            Err(error) => {
                panel.error = Some(error);
                cx.notify();
                return;
            }
        };

        panel.error = None;
        panel.pending = None;
        // Later reloads keep what the user is typing in fields they have not saved yet.
        if panel.saved.is_some() {
            panel.saved = Some(saved);
            self.load_column_catalogs(cx);
            cx.notify();
            return;
        }

        for (stage, input) in &panel.skills {
            let text = saved[COLUMN_SKILLS][stage.id()]
                .as_array()
                .map(|names| {
                    names
                        .iter()
                        .filter_map(Value::as_str)
                        .collect::<Vec<_>>()
                        .join(", ")
                })
                .unwrap_or_default();
            input.update(cx, |input, cx| input.set_text(text, cx));
        }
        let limit = |key: &str, default: String| {
            saved[key]
                .as_i64()
                .map_or(default, |value| value.to_string())
        };
        let (concurrency, stall) = (
            limit(MAX_CONCURRENT, DEFAULT_CONCURRENCY.to_string()),
            limit(STALL_MINUTES, DEFAULT_STALL_MINUTES.to_string()),
        );
        panel
            .concurrency
            .update(cx, |input, cx| input.set_text(concurrency, cx));
        panel
            .stall
            .update(cx, |input, cx| input.set_text(stall, cx));
        panel.saved = Some(saved);
        self.load_column_catalogs(cx);
        cx.notify();
    }

    pub(crate) fn finish_settings_update(&mut self, error: Option<String>, cx: &mut Context<Self>) {
        let Some(panel) = &mut self.settings else {
            self.error = error;
            cx.notify();
            return;
        };
        let saved = panel.pending.clone();
        if let Some(error) = error {
            panel.pending = None;
            panel.error = Some(error);
            cx.notify();
            return;
        }

        if let Some(SettingsPatch::ColumnSkills(stage, None)) = saved
            && let Some((_, input)) = panel.skills.iter().find(|(entry, _)| *entry == stage)
        {
            input.update(cx, |input, cx| input.set_text(String::new(), cx));
        }
        self.load_settings(cx);
        self.refresh(cx);
    }
}
