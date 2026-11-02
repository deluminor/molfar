mod actions;
#[cfg(test)]
mod conflict_tests;
mod keyboard;
mod state;
#[cfg(test)]
mod tests;
mod view;

pub(super) use state::{Mode, Panel};

use super::Board;
use crate::{
    input::{self, Input},
    runtime::locked,
};
use gpui::{AppContext, Context, Window};
use molfar_core::task_board::stage::owner::types::Review;

impl Board {
    pub(in crate::task_board) fn open_owner_review(
        &mut self,
        card_id: String,
        mode: Mode,
        window: &mut Window,
        cx: &mut Context<Self>,
    ) {
        if self.stage_pending.is_some() || self.review.is_some() {
            return;
        }
        self.review_revision += 1;
        let note = cx.new(|cx| {
            Input::multiline_field(
                "Note for the next Grill round",
                "What should change in the spec or plan?",
                cx,
            )
        });
        let plan = cx.new(|cx| Input::multiline_field("Plan", "The implementation plan", cx));
        for (field, height) in [(&note, 90.), (&plan, 300.)] {
            field.update(cx, |field, _| {
                field.set_min_height(height);
                field.set_max_height(height);
                field.set_read_only(true);
            });
        }
        let mut subscriptions = Vec::new();
        for field in [&note, &plan] {
            subscriptions.push(cx.subscribe(field, |_, _, _: &input::Changed, cx| cx.notify()));
            subscriptions.push(cx.subscribe(field, |this, _, _: &input::Submitted, cx| {
                this.submit_owner_review(false, cx)
            }));
        }
        let focus = cx.focus_handle();
        window.focus(&focus, cx);
        self.review = Some(Panel {
            card_id,
            mode,
            focus,
            cancel_focus: cx.focus_handle(),
            submit_focus: cx.focus_handle(),
            changes_focus: cx.focus_handle(),
            reload_focus: cx.focus_handle(),
            data: None,
            answers: Vec::new(),
            note,
            plan,
            busy: false,
            loading: false,
            error: None,
            reload_required: false,
            _subscriptions: subscriptions,
            answer_subscriptions: Vec::new(),
        });
        self.load_owner_review(cx);
    }

    pub(super) fn load_owner_review(&mut self, cx: &mut Context<Self>) {
        let Some(panel) = &mut self.review else {
            return;
        };
        if panel.loading || panel.busy {
            return;
        }
        panel.loading = true;
        panel.error = None;
        for field in panel.fields() {
            field.update(cx, |input, _| input.set_read_only(true));
        }
        let card_id = panel.card_id.clone();
        let revision = self.review_revision;
        let store = self.store.clone();
        let work = cx
            .background_executor()
            .spawn(async move { locked(&store)?.board_owner_review(&card_id) });
        cx.spawn(async move |this, cx| {
            let result = work.await;
            let _ = this.update_in(cx, |this, window, cx| {
                this.finish_owner_load(revision, result, window, cx)
            });
        })
        .detach();
        cx.notify();
    }

    fn finish_owner_load(
        &mut self,
        revision: u64,
        result: Result<Review, String>,
        window: &mut Window,
        cx: &mut Context<Self>,
    ) {
        if self.review_revision != revision {
            return;
        }
        let Some(panel) = &mut self.review else {
            return;
        };
        let restore_focus = panel.owns_focus(window, cx);
        panel.loading = false;
        match result {
            Ok(data) => {
                panel.error = None;
                panel.reload_required = false;
                panel
                    .note
                    .update(cx, |input, cx| input.set_text(String::new(), cx));
                panel.answer_subscriptions.clear();
                panel.answers = data
                    .questions
                    .iter()
                    .map(|question| {
                        let field = cx.new(|cx| {
                            Input::multiline_field(
                                &format!("Answer to question {}", question.number),
                                "Your answer",
                                cx,
                            )
                        });
                        field.update(cx, |field, cx| {
                            field.set_text(question.recommended.clone(), cx);
                            field.set_min_height(60.);
                            field.set_max_height(60.);
                        });
                        panel
                            .answer_subscriptions
                            .push(cx.subscribe(&field, |_, _, _: &input::Changed, cx| cx.notify()));
                        panel.answer_subscriptions.push(
                            cx.subscribe(&field, |this, _, _: &input::Submitted, cx| {
                                this.submit_owner_review(false, cx)
                            }),
                        );
                        field
                    })
                    .collect();
                panel
                    .plan
                    .update(cx, |input, cx| input.set_text(data.plan.clone(), cx));
                panel.data = Some(data);
                for field in panel.fields() {
                    field.update(cx, |input, _| input.set_read_only(false));
                }
                if restore_focus {
                    window.focus(&panel.initial_focus(cx), cx);
                }
            }
            Err(error) => {
                panel.error = Some(error);
                for field in panel.fields() {
                    field.update(cx, |input, _| input.set_read_only(false));
                }
            }
        }
        cx.notify();
    }

    pub(super) fn close_owner_review(&mut self, window: &mut Window, cx: &mut Context<Self>) {
        if self.review.as_ref().is_some_and(|panel| panel.busy) {
            return;
        }
        self.review_revision += 1;
        self.review = None;
        window.focus(&self.focus, cx);
        cx.notify();
    }
}
