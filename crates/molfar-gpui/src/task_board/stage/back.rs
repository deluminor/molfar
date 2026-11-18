use molfar_core::task_board::{
    constants::COLUMNS,
    stage::{
        agent::AgentStage,
        transitions::{allowed::back_allowed, back_target},
    },
    types::{Card, Snapshot},
};

pub(in crate::task_board) fn back_label(
    card: &Card,
    snapshot: Option<&Snapshot>,
) -> Option<String> {
    let stage = AgentStage::parse(&card.column_id)?;
    back_allowed(card, snapshot).then(|| format!("Back to {}", column_label(back_target(stage))))
}

pub(in crate::task_board) fn column_label(column: &str) -> &str {
    COLUMNS
        .iter()
        .find(|(id, _)| *id == column)
        .map_or(column, |(_, label)| label)
}
