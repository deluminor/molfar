use super::super::{Board, Event};
use crate::{modal, theme::*};
use gpui::{AnyElement, Context, Role, div, prelude::*};
use molfar_core::task_board::constants::{BACKLOG, GRILL, IDLE, PLAN_APPROVAL};
use molfar_core::task_board::stage::lifecycle::constants::{FAILED, QUEUED, RUNNING};
use molfar_core::task_board::{stage::lifecycle::types::StageAction, types::Card};

pub(super) fn stage_action(card: &Card) -> Option<(&'static str, StageAction)> {
    if card.archived {
        return None;
    }
    match (card.column_id.as_str(), card.run_state.as_str()) {
        (BACKLOG, IDLE) => Some(("Start Grill", StageAction::Start)),
        (GRILL, FAILED) => Some(("Retry Grill", StageAction::Retry)),
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
                        action,
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

    pub(crate) fn finish_stage_action(&mut self, error: Option<String>, cx: &mut Context<Self>) {
        self.stage_pending = None;
        if let Some(error) = error {
            self.error = Some(error);
            cx.notify();
        } else {
            self.refresh(cx);
        }
    }

    pub(crate) fn reveal_card(&mut self, id: String, cx: &mut Context<Self>) {
        self.project_only = false;
        self.archived = false;
        self.snapshot = None;
        self.selected = Some(id);
        self.refresh(cx);
    }
}
