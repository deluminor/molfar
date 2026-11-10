use super::{
    super::{Board, Event},
    Panel,
};
use crate::input::{self, Input};
use crate::theme::content;
use gpui::{AppContext, Context, Window};
use molfar_core::task_board::stage::{agent::AgentStage, choice::settings::SettingsPatch};

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
        let skill_search =
            cx.new(|cx| Input::field("Search skills", "Search skills", content(0.35), cx));
        let subscriptions = skills
            .iter()
            .map(|(_, input)| input)
            .chain([&concurrency, &stall, &skill_search])
            .map(|input| cx.subscribe(input, |_, _, _: &input::Changed, cx| cx.notify()))
            .collect();
        let panel = Panel {
            focus: cx.focus_handle(),
            column: None,
            picker_surface: Default::default(),
            catalog: Vec::new(),
            catalog_error: None,
            models: Vec::new(),
            skill_search,
            adding_skills: false,
            saved: None,
            anchors: AgentStage::ALL
                .into_iter()
                .map(|stage| (stage, Default::default()))
                .collect(),
            skills,
            concurrency,
            stall,
            error: None,
            pending: None,
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

    pub(super) fn emit_settings(&mut self, patch: SettingsPatch, cx: &mut Context<Self>) {
        if let Some(panel) = &mut self.settings {
            if panel.column.is_some() && (panel.pending.is_some() || panel.saved.is_none()) {
                return;
            }
            panel.error = None;
            panel.pending = Some(patch.clone());
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
        if self
            .settings
            .as_ref()
            .and_then(|panel| panel.column(stage))
            .is_none()
        {
            return;
        }
        self.emit_settings(SettingsPatch::ColumnMode(stage, mode.to_owned()), cx);
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
        let skills: Vec<String> = input
            .read(cx)
            .content
            .split([',', ' ', '\n'])
            .filter(|name| !name.is_empty())
            .map(str::to_owned)
            .collect();
        let skills = (!skills.is_empty()).then_some(skills);
        self.emit_settings(SettingsPatch::ColumnSkills(stage, skills), cx);
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
