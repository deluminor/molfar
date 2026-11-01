use super::super::settings::PickTarget;
use super::super::{Board, Event};
use crate::{modal, theme::*};
use gpui::{AnyElement, Context, Role, div, prelude::*};
use molfar_core::task_board::constants::{BACKLOG, COLUMNS, GRILL, IDLE, PLAN_APPROVAL};
use molfar_core::task_board::stage::lifecycle::constants::{FAILED, QUEUED, RUNNING};
use molfar_core::task_board::stage::{agent::AgentStage, transitions::back_target};
use molfar_core::task_board::{stage::lifecycle::types::StageAction, types::Card};

fn back_label(card: &Card) -> Option<String> {
    let stage = AgentStage::parse(&card.column_id)?;
    if card.archived || card.run_state != FAILED {
        return None;
    }
    let target = back_target(stage);
    let label = COLUMNS
        .iter()
        .find(|(id, _)| *id == target)
        .map_or(target, |(_, label)| label);
    Some(format!("Back to {label}"))
}

pub(super) fn stage_action(card: &Card) -> Option<(&'static str, StageAction)> {
    if card.archived {
        return None;
    }
    match (card.column_id.as_str(), card.run_state.as_str()) {
        (BACKLOG, IDLE) => Some(("Start Grill", StageAction::Start)),
        (GRILL, FAILED) => Some(("Retry Grill", StageAction::Retry(None))),
        (GRILL, QUEUED | RUNNING) => Some(("Cancel run", StageAction::Cancel)),
        _ => None,
    }
}

impl Board {
    pub(in crate::task_board) fn stage_actions(
        &self,
        card: &Card,
        cx: &mut Context<Self>,
    ) -> AnyElement {
        let pending = self.stage_pending.as_deref() == Some(&card.id);
        let mut row = div().flex().flex_wrap().gap_2().mb_4();
        if let Some((label, action)) = stage_action(card) {
            let card_id = card.id.clone();
            let updated_at = card.updated_at;
            row = row.child(
                modal::disabled(
                    modal::primary_button(
                        "board-stage-action",
                        if pending { "Working…" } else { label },
                    ),
                    pending,
                )
                .role(Role::Button)
                .aria_label(label)
                .debug_selector(|| "board-stage-action".into())
                .on_click(cx.listener(move |this, _, _, cx| {
                    if this.stage_pending.is_some() {
                        return;
                    }
                    this.stage_pending = Some(card_id.clone());
                    cx.emit(Event::Stage {
                        card_id: card_id.clone(),
                        updated_at,
                        action: action.clone(),
                    });
                    cx.notify();
                })),
            );
        }
        if matches!(stage_action(card), Some((_, StageAction::Retry(_)))) {
            let card_id = card.id.clone();
            let updated_at = card.updated_at;
            let anchor = self.retry_anchor.clone();
            row = row.child(anchor.probe()).child(
                modal::disabled(
                    modal::ghost_button("board-retry-model", "Retry with model…"),
                    pending,
                )
                .debug_selector(|| "board-retry-model".into())
                .on_click(cx.listener(move |this, _, window, cx| {
                    let target = PickTarget::Retry {
                        card_id: card_id.clone(),
                        updated_at,
                    };
                    this.open_model_picker(target, anchor.clone(), window, cx)
                })),
            );
        }
        if let Some(target) = back_label(card) {
            let card_id = card.id.clone();
            let updated_at = card.updated_at;
            row = row.child(
                modal::disabled(modal::ghost_button("board-stage-back", target), pending)
                    .debug_selector(|| "board-stage-back".into())
                    .on_click(cx.listener(move |this, _, _, cx| {
                        if this.stage_pending.is_some() {
                            return;
                        }
                        this.stage_pending = Some(card_id.clone());
                        cx.emit(Event::Stage {
                            card_id: card_id.clone(),
                            updated_at,
                            action: StageAction::Back,
                        });
                        cx.notify();
                    })),
            );
        }
        if let Some(session) = self.snapshot.as_ref().and_then(|snapshot| {
            snapshot
                .runs
                .iter()
                .rev()
                .filter(|run| run.card_id == card.id)
                .find_map(|run| run.session_id.clone())
        }) {
            row =
                row.child(
                    modal::ghost_button("board-open-stage-session", "Open session")
                        .debug_selector(|| "board-open-stage-session".into())
                        .on_click(cx.listener(move |_, _, _, cx| {
                            cx.emit(Event::OpenSession(session.clone()))
                        })),
                );
        }
        if card.column_id == PLAN_APPROVAL {
            row = row.child(
                div()
                    .text_color(content(0.65))
                    .child("Plan ready. Open the saved artifacts to review."),
            );
        }
        row.into_any_element()
    }

    pub(crate) fn finish_update(&mut self, error: Option<String>, cx: &mut Context<Self>) {
        self.stage_pending = None;
        match error {
            Some(error) => self.error = Some(error),
            None => self.refresh(cx),
        }
        cx.notify();
    }

    pub(crate) fn reveal_card(&mut self, id: String, cx: &mut Context<Self>) {
        self.project_only = false;
        self.archived = false;
        self.snapshot = None;
        self.selected = Some(id);
        self.refresh(cx);
    }
}
