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
        agent::AgentStage,
        choice::{
            overrides::StageModelOverride,
            settings::{HARNESS, MODEL, SettingsPatch},
        },
        lifecycle::types::StageAction,
    },
};
use serde_json::Value;

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
            PickTarget::Retry { card_id, .. } => self.card_override(card_id),
        };
        let default = cx
            .try_global::<crate::settings::Preferences>()
            .and_then(|prefs| prefs.default_provider.as_deref())
            .and_then(Kind::parse)
            .unwrap_or(Kind::Codex);
        let kind = column
            .as_ref()
            .and_then(|config| config[HARNESS].as_str())
            .and_then(Kind::parse)
            .unwrap_or(default);
        let current = column
            .as_ref()
            .and_then(|config| config[MODEL].as_str())
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
                let harness = kind.id().into();
                self.emit_settings(
                    SettingsPatch::ColumnModel {
                        stage,
                        harness,
                        model,
                    },
                    cx,
                );
            }
            PickTarget::Retry {
                card_id,
                updated_at,
            } => {
                if self.stage_pending.is_some() {
                    return;
                }
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

    fn card_override(&self, card_id: &str) -> Option<Value> {
        let card = self
            .snapshot
            .as_ref()?
            .cards
            .iter()
            .find(|card| card.id == card_id)?;
        let stage = AgentStage::parse(&card.column_id)?;
        let overrides: Value = serde_json::from_str(&card.overrides_json).ok()?;
        overrides.get(stage.id()).cloned()
    }

    fn picker_error(&mut self, error: &str, cx: &mut Context<Self>) {
        match &mut self.settings {
            Some(panel) => panel.error = Some(error.into()),
            None => self.error = Some(error.into()),
        }
        cx.notify();
    }
}
