use super::{
    super::{Board, Event},
    Panel,
};
use crate::input::{self, Input};
use crate::theme::content;
use gpui::{AppContext, Context, Window};
use molfar_core::task_board::stage::{
    agent::AgentStage,
    choice::settings::{SettingsPatch, StageModelConfig},
};
use serde_json::Value;

const DEFAULT_CONCURRENCY: &str = "3";
const DEFAULT_STALL_MINUTES: &str = "45";

impl Board {
    pub(in crate::task_board) fn open_settings(
        &mut self,
        window: &mut Window,
        cx: &mut Context<Self>,
    ) {
        let field = |label: &str, cx: &mut Context<Self>| {
            cx.new(|cx| Input::field(label, label, content(0.35), cx))
        };
        let skills: Vec<_> = AgentStage::ALL
            .into_iter()
            .map(|stage| (stage, field("Skills (auto when empty)", cx)))
            .collect();
        let concurrency = field("Concurrent stages", cx);
        let stall = field("Stall minutes", cx);
        let subscriptions = skills
            .iter()
            .map(|(_, input)| input)
            .chain([&concurrency, &stall])
            .map(|input| cx.subscribe(input, |_, _, _: &input::Changed, cx| cx.notify()))
            .collect();
        let panel = Panel {
            focus: cx.focus_handle(),
            saved: None,
            anchors: AgentStage::ALL
                .into_iter()
                .map(|stage| (stage, Default::default()))
                .collect(),
            skills,
            concurrency,
            stall,
            error: None,
            _subscriptions: subscriptions,
        };
        window.focus(&panel.focus, cx);
        self.settings = Some(panel);
        self.load_settings(cx);
    }

    pub(in crate::task_board) fn close_settings(
        &mut self,
        window: &mut Window,
        cx: &mut Context<Self>,
    ) {
        self.settings = None;
        self.picker = None;
        window.focus(&self.focus, cx);
        cx.notify();
    }

    pub(in crate::task_board) fn load_settings(&mut self, cx: &mut Context<Self>) {
        let store = self.store.clone();
        let work = cx
            .background_executor()
            .spawn(async move { crate::runtime::locked(&store)?.board_settings_json() });
        cx.spawn(async move |this, cx| {
            let result = work.await;
            let _ = this.update(cx, |this, cx| this.finish_settings_load(result, cx));
        })
        .detach();
    }

    fn finish_settings_load(
        &mut self,
        result: Result<Option<String>, String>,
        cx: &mut Context<Self>,
    ) {
        let Some(panel) = &mut self.settings else {
            return;
        };
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

        for (stage, input) in &panel.skills {
            let text = saved["columnSkills"][stage.id()]
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
        let limit = |key: &str, default: &str| {
            saved[key]
                .as_i64()
                .map_or(default.to_owned(), |value| value.to_string())
        };
        let (concurrency, stall) = (
            limit("maxConcurrentStages", DEFAULT_CONCURRENCY),
            limit("stallMinutes", DEFAULT_STALL_MINUTES),
        );
        panel
            .concurrency
            .update(cx, |input, cx| input.set_text(concurrency, cx));
        panel
            .stall
            .update(cx, |input, cx| input.set_text(stall, cx));
        panel.saved = Some(saved);
        cx.notify();
    }

    fn emit_settings(&mut self, patch: SettingsPatch, cx: &mut Context<Self>) {
        if let Some(panel) = &mut self.settings {
            panel.error = None;
        }
        cx.emit(Event::Settings(patch));
        cx.notify();
    }

    pub(in crate::task_board) fn set_stage_mode(
        &mut self,
        stage: AgentStage,
        mode: &str,
        cx: &mut Context<Self>,
    ) {
        let Some(column) = self.settings.as_ref().and_then(|panel| panel.column(stage)) else {
            return;
        };
        let Ok(mut config) = serde_json::from_value::<StageModelConfig>(column.clone()) else {
            return;
        };
        config.runtime_mode = mode.to_owned();
        self.emit_settings(SettingsPatch::Column(stage, Some(config)), cx);
    }

    pub(in crate::task_board) fn reset_stage_model(
        &mut self,
        stage: AgentStage,
        cx: &mut Context<Self>,
    ) {
        self.emit_settings(SettingsPatch::Column(stage, None), cx);
    }

    pub(in crate::task_board) fn save_stage_skills(
        &mut self,
        stage: AgentStage,
        cx: &mut Context<Self>,
    ) {
        let Some(panel) = &self.settings else {
            return;
        };
        let Some((_, input)) = panel.skills.iter().find(|(entry, _)| *entry == stage) else {
            return;
        };
        let skills = input
            .read(cx)
            .content
            .split([',', ' ', '\n'])
            .filter(|name| !name.is_empty())
            .map(str::to_owned)
            .collect();
        self.emit_settings(SettingsPatch::ColumnSkills(stage, Some(skills)), cx);
    }

    pub(in crate::task_board) fn reset_stage_skills(
        &mut self,
        stage: AgentStage,
        cx: &mut Context<Self>,
    ) {
        self.emit_settings(SettingsPatch::ColumnSkills(stage, None), cx);
    }

    pub(in crate::task_board) fn save_limits(&mut self, cx: &mut Context<Self>) {
        let Some(panel) = &mut self.settings else {
            return;
        };
        let number =
            |input: &gpui::Entity<Input>| input.read(cx).content.trim().parse::<i64>().ok();
        let (Some(max_concurrent), Some(stall_minutes)) =
            (number(&panel.concurrency), number(&panel.stall))
        else {
            panel.error = Some("Enter whole numbers for both limits.".into());
            cx.notify();
            return;
        };
        self.emit_settings(
            SettingsPatch::Limits {
                max_concurrent,
                stall_minutes,
            },
            cx,
        );
    }

    pub(in crate::task_board) fn settings_focus(
        &self,
        cx: &gpui::App,
    ) -> Option<gpui::FocusHandle> {
        let panel = self.settings.as_ref()?;
        Some(self.picker.as_ref().map_or(panel.focus.clone(), |picker| {
            picker.list.read(cx).search_focus(cx)
        }))
    }
}
