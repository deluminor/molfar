use super::super::settings::PickTarget;
use super::super::{Board, Event};
use super::back::back_label;
use super::footer::{Footer, lead_button, quiet_button, tonal_button};
use crate::modal;
use crate::task_board::review::Mode;
use gpui::{AnyElement, Context, Role, div, prelude::*};
use molfar_core::task_board::constants::{
    BACKLOG, CODE_REVIEW, FINAL_REVIEW, GRILL, IDLE, IMPLEMENT, PLAN_APPROVAL, REWORK,
};
use molfar_core::task_board::stage::lifecycle::constants::{FAILED, QUEUED, RUNNING};
use molfar_core::task_board::{stage::lifecycle::types::StageAction, types::Card};

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
        let mut footer = Footer::default();
        let awaiting_plan =
            card.column_id == PLAN_APPROVAL && card.run_state == IDLE && !card.archived;
        if awaiting_plan {
            footer.hint = Some("Plan ready. Review the questions or the plan, then approve.");
        }

        if let Some((label, action)) = stage_action(card) {
            let card_id = card.id.clone();
            let updated_at = card.updated_at;
            let text = if pending { "Working…" } else { label };
            let button = match action {
                StageAction::Cancel => tonal_button("board-stage-action", text),
                _ => lead_button("board-stage-action", text),
            };
            footer.lead.push(
                modal::disabled(button, pending)
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
                    }))
                    .into_any_element(),
            );
        }
        if awaiting_plan {
            let card_id = card.id.clone();
            footer.lead.push(
                modal::disabled(
                    tonal_button("board-owner-review", "Review questions"),
                    pending,
                )
                .debug_selector(|| "board-owner-review".into())
                .on_click(cx.listener(move |this, _, window, cx| {
                    this.open_owner_review(card_id.clone(), Mode::Questions, window, cx)
                }))
                .into_any_element(),
            );
        }
        if card.column_id == FINAL_REVIEW
            && matches!(card.run_state.as_str(), IDLE | FAILED)
            && !card.archived
        {
            let card_id = card.id.clone();
            footer.lead.push(
                modal::disabled(
                    tonal_button("board-owner-rework", "Review findings & rework"),
                    pending,
                )
                .debug_selector(|| "board-owner-rework".into())
                .on_click(cx.listener(move |this, _, window, cx| {
                    this.open_owner_review(card_id.clone(), Mode::Rework, window, cx)
                }))
                .into_any_element(),
            );
        }
        footer.lead.extend(self.deliver_action(card, pending, cx));

        if let Some(session) = self.snapshot.as_ref().and_then(|snapshot| {
            snapshot
                .runs
                .iter()
                .rev()
                .filter(|run| run.card_id == card.id)
                .find_map(|run| run.session_id.clone())
        }) {
            footer.quiet.push(
                quiet_button("board-open-stage-session", "external-link", "Open session")
                    .debug_selector(|| "board-open-stage-session".into())
                    .on_click(
                        cx.listener(move |_, _, _, cx| {
                            cx.emit(Event::OpenSession(session.clone()))
                        }),
                    )
                    .into_any_element(),
            );
        }
        if awaiting_plan {
            let card_id = card.id.clone();
            footer.quiet.push(
                modal::disabled(
                    quiet_button("board-owner-edit-plan", "pencil-line", "Edit plan"),
                    pending,
                )
                .debug_selector(|| "board-owner-edit-plan".into())
                .on_click(cx.listener(move |this, _, window, cx| {
                    this.open_owner_review(card_id.clone(), Mode::Plan, window, cx)
                }))
                .into_any_element(),
            );
        }
        if matches!(stage_action(card), Some((_, StageAction::Retry(_)))) {
            let card_id = card.id.clone();
            let updated_at = card.updated_at;
            let anchor = self.retry_anchor.clone();
            footer.quiet.push(
                div()
                    .child(anchor.probe())
                    .child(
                        modal::disabled(
                            quiet_button("board-retry-model", "refresh-cw", "Retry with model…"),
                            pending,
                        )
                        .debug_selector(|| "board-retry-model".into())
                        .on_click(cx.listener(
                            move |this, _, window, cx| {
                                let target = PickTarget::Retry {
                                    card_id: card_id.clone(),
                                    updated_at,
                                };
                                this.open_model_picker(target, anchor.clone(), window, cx)
                            },
                        )),
                    )
                    .into_any_element(),
            );
        }
        if let Some(target) = back_label(card, self.snapshot.as_ref()) {
            let card_id = card.id.clone();
            let updated_at = card.updated_at;
            footer.quiet.push(
                modal::disabled(
                    quiet_button("board-stage-back", "arrow-left", target),
                    pending,
                )
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
                }))
                .into_any_element(),
            );
        }
        footer.quiet.extend(self.move_action(card, pending, cx));
        footer.end = self.reject_action(card, pending, cx);

        footer.render()
    }

    pub(crate) fn finish_update(&mut self, error: Option<String>, cx: &mut Context<Self>) {
        self.stage_pending = None;
        if self.finish_edit_update(error.clone(), cx) {
            cx.notify();
            return;
        }
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

    pub(crate) fn finish_background(&mut self, error: Option<String>, cx: &mut Context<Self>) {
        if error.is_some() {
            self.error = error;
        }
        self.refresh(cx);
        cx.notify();
    }

    pub(crate) fn reveal_card(&mut self, id: String, cx: &mut Context<Self>) {
        self.project_only = false;
        self.project_filter = None;
        self.reset_detail_artifact();
        self.archived = false;
        self.snapshot = None;
        self.selected = Some(id);
        self.refresh(cx);
    }
}
