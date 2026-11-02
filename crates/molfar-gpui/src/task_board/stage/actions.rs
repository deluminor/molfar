use super::super::settings::PickTarget;
use super::super::{Board, Event};
use crate::{modal, theme::*};
use gpui::{AnyElement, Context, Role, div, prelude::*};
use molfar_core::task_board::constants::{
    BACKLOG, CODE_REVIEW, COLUMNS, FINAL_REVIEW, GRILL, IDLE, IMPLEMENT, PLAN_APPROVAL, REWORK,
};
use molfar_core::task_board::stage::contracts::constants::REVIEW;
use molfar_core::task_board::stage::lifecycle::constants::{FAILED, QUEUED, RUNNING, SUCCEEDED};
use molfar_core::task_board::stage::{agent::AgentStage, transitions::back_target};
use molfar_core::task_board::types::Snapshot;
use molfar_core::task_board::{stage::lifecycle::types::StageAction, types::Card};

fn has_completed_review(card: &Card, snapshot: &Snapshot) -> bool {
    let review =
        snapshot.runs.iter().rev().find(|run| {
            run.card_id == card.id && run.stage == CODE_REVIEW && run.status == SUCCEEDED
        });

    review.is_some_and(|run| {
        snapshot.artifacts.iter().any(|artifact| {
            artifact.card_id == card.id
                && artifact.kind == REVIEW
                && artifact.stage_run_id.as_deref() == Some(&run.id)
        })
    })
}

fn back_label(card: &Card, snapshot: Option<&Snapshot>) -> Option<String> {
    let stage = AgentStage::parse(&card.column_id)?;
    if card.archived || card.run_state != FAILED {
        return None;
    }

    let needs_review = matches!(stage, AgentStage::CodeReview | AgentStage::Rework);
    if needs_review && !snapshot.is_some_and(|snapshot| has_completed_review(card, snapshot)) {
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
        (IMPLEMENT | CODE_REVIEW | REWORK, FAILED) => Some(("Retry run", StageAction::Retry(None))),
        (PLAN_APPROVAL, IDLE) => Some(("Approve plan & implement", StageAction::ApprovePlan)),
        (GRILL | IMPLEMENT | CODE_REVIEW | REWORK, QUEUED | RUNNING) => {
            Some(("Cancel run", StageAction::Cancel))
        }
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
        if let Some(target) = back_label(card, self.snapshot.as_ref()) {
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
        if card.column_id == PLAN_APPROVAL && card.run_state == IDLE && !card.archived {
            let card_id = card.id.clone();
            let plan_card = card.id.clone();
            row = row
                .child(
                    modal::disabled(
                        modal::primary_button("board-owner-review", "Review questions"),
                        pending,
                    )
                    .debug_selector(|| "board-owner-review".into())
                    .on_click(cx.listener(move |this, _, window, cx| {
                        this.open_owner_review(
                            card_id.clone(),
                            super::super::review::Mode::Questions,
                            window,
                            cx,
                        )
                    })),
                )
                .child(
                    modal::disabled(
                        modal::ghost_button("board-owner-edit-plan", "Edit plan"),
                        pending,
                    )
                    .debug_selector(|| "board-owner-edit-plan".into())
                    .on_click(cx.listener(move |this, _, window, cx| {
                        this.open_owner_review(
                            plan_card.clone(),
                            super::super::review::Mode::Plan,
                            window,
                            cx,
                        )
                    })),
                );
        }
        if card.column_id == FINAL_REVIEW
            && matches!(card.run_state.as_str(), IDLE | FAILED)
            && !card.archived
        {
            let card_id = card.id.clone();
            row = row.child(
                modal::disabled(
                    modal::primary_button("board-owner-rework", "Review findings & rework"),
                    pending,
                )
                .debug_selector(|| "board-owner-rework".into())
                .on_click(cx.listener(move |this, _, window, cx| {
                    this.open_owner_review(
                        card_id.clone(),
                        super::super::review::Mode::Rework,
                        window,
                        cx,
                    )
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
        if self.finish_owner_update(error.clone(), cx) {
            if error.is_none() {
                self.refresh(cx);
            }
            cx.notify();
            return;
        }
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
