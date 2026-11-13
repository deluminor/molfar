mod actions;
mod column;
mod column_skills;
#[cfg(test)]
mod column_tests;
mod effort;
#[cfg(test)]
mod effort_tests;
mod load;
mod picker;
#[cfg(test)]
mod routing_tests;
mod row;
mod skill_list;
#[cfg(test)]
mod skill_list_tests;
mod skill_rows;
#[cfg(test)]
pub(in crate::task_board) mod tests;
#[cfg(test)]
mod verify_tests;
mod view;

use crate::{input::Input, pickers::ModelList, popover::AnchorSlot};
use gpui::{Entity, FocusHandle, Subscription};
use molfar_core::task_board::stage::{
    agent::AgentStage,
    choice::{constants::RUNTIME_MODES, settings::COLUMNS},
};
use serde_json::Value;

const MODE_LABELS: [&str; 4] = ["Supervised", "Accept edits", "Auto", "Full access"];

fn modes() -> impl Iterator<Item = (&'static str, &'static str)> {
    RUNTIME_MODES.into_iter().zip(MODE_LABELS)
}

fn stage_label(stage: AgentStage) -> &'static str {
    molfar_core::task_board::constants::COLUMNS
        .iter()
        .find(|(id, _)| *id == stage.id())
        .map_or(stage.id(), |(_, label)| label)
}

pub(super) enum PickTarget {
    Column(AgentStage),
    Retry { card_id: String, updated_at: i64 },
}

pub(super) struct Picker {
    pub target: PickTarget,
    pub list: Entity<ModelList>,
    pub anchor: AnchorSlot,
    _subscription: Subscription,
}

pub(super) struct Panel {
    pub focus: FocusHandle,
    pub column: Option<AgentStage>,
    pub picker_surface: AnchorSlot,
    pub catalog: Vec<String>,
    pub catalog_error: Option<String>,
    pub models: Vec<(
        molfar_core::provider::Kind,
        Vec<molfar_core::catalog::Model>,
    )>,
    pub skill_search: Entity<Input>,
    pub adding_skills: bool,
    pub saved: Option<Value>,
    pub skills: Vec<(AgentStage, Entity<Input>)>,
    pub anchors: Vec<(AgentStage, AnchorSlot)>,
    pub concurrency: Entity<Input>,
    pub stall: Entity<Input>,
    /// The project whose verify command this panel edits, fixed when the panel opens.
    pub project: String,
    pub verify: Entity<Input>,
    pub error: Option<String>,
    pub pending: Option<molfar_core::task_board::stage::choice::settings::SettingsPatch>,
    _subscriptions: Vec<Subscription>,
}

impl Panel {
    fn column(&self, stage: AgentStage) -> Option<&Value> {
        self.saved.as_ref()?.get(COLUMNS)?.get(stage.id())
    }

    fn anchor(&self, stage: AgentStage) -> AnchorSlot {
        self.anchors
            .iter()
            .find(|(entry, _)| *entry == stage)
            .map(|(_, anchor)| anchor.clone())
            .unwrap_or_default()
    }
}
