use super::{
    super::{Board, Event},
    PickTarget, Picker,
};
use crate::pickers::{ModelList, ModelPicked};
use crate::popover::AnchorSlot;
use gpui::{AppContext, Context, Window};
use molfar_core::{
    provider::Kind,
    store::{desktop_model_id, native_model},
    task_board::stage::{
        choice::{
            overrides::StageModelOverride,
            settings::{SettingsPatch, StageModelConfig},
        },
        lifecycle::types::StageAction,
    },
};

const DEFAULT_RUNTIME_MODE: &str = "auto";

impl Board {
    pub(in crate::task_board) fn open_model_picker(
        &mut self,
        target: PickTarget,
        anchor: AnchorSlot,
        window: &mut Window,
        cx: &mut Context<Self>,
    ) {
        let column = match &target {
            PickTarget::Column(stage) => self
                .settings
                .as_ref()
                .and_then(|panel| panel.column(*stage))
                .cloned(),
            PickTarget::Retry { .. } => None,
        };
        let kind = column
            .as_ref()
            .and_then(|config| config["harness"].as_str())
            .and_then(Kind::parse)
            .unwrap_or(Kind::Codex);
        let current = column
            .as_ref()
            .and_then(|config| config["model"].as_str())
            .and_then(|model| native_model(model, kind.id()));
        let project = self.cwd.clone();
        let profile = crate::accounts::get(cx)
            .map(|accounts| accounts.read(cx).selected(kind, &project))
            .unwrap_or_default();
        let list = cx.new(|cx| ModelList::new_for(kind, current, &project, profile, cx));
        let subscription = cx.subscribe_in(
            &list,
            window,
            |this, _, picked: &ModelPicked, window, cx| this.model_picked(picked, window, cx),
        );
        window.focus(&list.read(cx).search_focus(cx), cx);
        self.picker = Some(Picker {
            target,
            list,
            anchor,
            _subscription: subscription,
        });
        cx.notify();
    }

    fn model_picked(&mut self, picked: &ModelPicked, window: &mut Window, cx: &mut Context<Self>) {
        let Some(picker) = self.picker.take() else {
            return;
        };
        let ModelPicked(kind, model) = picked;
        let Some(model) = model.as_deref() else {
            self.picker_error("Pick a specific model for this stage.", cx);
            return;
        };
        let model = desktop_model_id(Some(model), kind.id());

        match picker.target {
            PickTarget::Column(stage) => {
                let mode = self
                    .settings
                    .as_ref()
                    .and_then(|panel| panel.column(stage))
                    .and_then(|config| config["runtimeMode"].as_str())
                    .unwrap_or(DEFAULT_RUNTIME_MODE)
                    .to_owned();
                let config = StageModelConfig {
                    harness: kind.id().into(),
                    model,
                    effort: None,
                    runtime_mode: mode,
                };
                cx.emit(Event::Settings(SettingsPatch::Column(stage, Some(config))));
            }
            PickTarget::Retry {
                card_id,
                updated_at,
            } => {
                let change = StageModelOverride {
                    harness: Some(kind.id().into()),
                    model: Some(model),
                    ..Default::default()
                };
                self.stage_pending = Some(card_id.clone());
                cx.emit(Event::Stage {
                    card_id,
                    updated_at,
                    action: StageAction::Retry(Some(change)),
                });
            }
        }
        window.focus(
            &self
                .settings
                .as_ref()
                .map_or(self.focus.clone(), |panel| panel.focus.clone()),
            cx,
        );
        cx.notify();
    }

    fn picker_error(&mut self, error: &str, cx: &mut Context<Self>) {
        match &mut self.settings {
            Some(panel) => panel.error = Some(error.into()),
            None => self.error = Some(error.into()),
        }
        cx.notify();
    }
}
