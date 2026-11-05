use super::{
    super::{Board, Event},
    Mode,
};
use gpui::Context;
use molfar_core::task_board::stage::{lifecycle::types::StageAction, owner::types::Answer};

impl Board {
    pub(super) fn submit_owner_review(&mut self, changes: bool, cx: &mut Context<Self>) {
        if self.stage_pending.is_some() {
            return;
        }
        let Some(panel) = &mut self.review else {
            return;
        };
        if !panel.can_submit(changes, cx) {
            return;
        }
        let Some(data) = &panel.data else { return };
        let note = panel.note.read(cx).content.to_string();
        let action = if panel.mode == Mode::Plan {
            StageAction::EditPlan(panel.plan.read(cx).content.to_string())
        } else if panel.mode == Mode::Rework {
            let Some(review) = data.final_review() else {
                return;
            };
            StageAction::Rework {
                findings: review
                    .review
                    .findings
                    .iter()
                    .filter(|finding| panel.selected.contains(&finding.id))
                    .map(|finding| finding.id.clone())
                    .collect(),
                note,
                review_version: review.version,
            }
        } else if changes || panel.answers.is_empty() {
            StageAction::RequestChanges(note)
        } else {
            StageAction::Answer {
                answers: data
                    .questions()
                    .iter()
                    .zip(&panel.answers)
                    .map(|(question, answer)| Answer {
                        number: question.number,
                        answer: answer.read(cx).content.to_string(),
                    })
                    .collect(),
                note,
            }
        };
        let card_id = data.card().id.clone();
        let updated_at = data.card().updated_at;
        panel.busy = true;
        panel.error = None;
        for field in panel.fields() {
            field.update(cx, |input, _| input.set_read_only(true));
        }
        self.stage_pending = Some(card_id.clone());
        cx.emit(Event::Stage {
            card_id,
            updated_at,
            action,
        });
        cx.notify();
    }

    pub(in crate::task_board) fn finish_owner_update(
        &mut self,
        error: Option<String>,
        cx: &mut Context<Self>,
    ) -> bool {
        let Some(panel) = &mut self.review else {
            return false;
        };
        if !panel.busy {
            return false;
        }
        panel.busy = false;
        match error {
            Some(error) => {
                panel.reload_required = error.starts_with(
                    molfar_core::task_board::stage::lifecycle::constants::CONFLICT_PREFIX,
                );
                panel.error = Some(error);
                for field in panel.fields() {
                    field.update(cx, |input, _| input.set_read_only(false));
                }
            }
            None => {
                let handles = panel.handles(cx);
                self.review = None;
                self.review_revision += 1;
                let revision = self.review_revision;
                cx.spawn(async move |this, cx| {
                    let _ = this.update_in(cx, |this, window, cx| {
                        if this.review_revision == revision
                            && this.review.is_none()
                            && handles.iter().any(|focus| focus.is_focused(window))
                        {
                            window.focus(&this.focus, cx);
                        }
                    });
                })
                .detach();
            }
        }
        true
    }
}
