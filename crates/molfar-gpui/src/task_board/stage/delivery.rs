use super::super::{Board, Event};
use crate::{modal, theme::*};
use gpui::{Context, Div, Window, div, prelude::*, px};
use molfar_core::task_board::{
    constants::{DONE, FINAL_REVIEW, IDLE},
    delivery::{record, types::DeliveryMethod},
    stage::lifecycle::constants::{FAILED, RUNNING},
    types::Card,
};

const METHODS: [(DeliveryMethod, &str, &str, &str); 3] = [
    (
        DeliveryMethod::Pr,
        "board-deliver-pr",
        "Open pull request",
        "Push the branch and open a PR.",
    ),
    (
        DeliveryMethod::Merge,
        "board-deliver-merge",
        "Squash-merge",
        "Open a PR and squash-merge it right away.",
    ),
    (
        DeliveryMethod::Keep,
        "board-deliver-keep",
        "Keep branch",
        "No push. Remove the worktree, keep the branch.",
    ),
];

pub(in crate::task_board) fn status_text(card: &Card) -> String {
    if card.column_id == FINAL_REVIEW && card.run_state == RUNNING {
        return "Delivering".into();
    }
    if card.column_id == DONE {
        return "Delivered".into();
    }
    format!("{} · {}", card.column_id, card.run_state)
}

pub(in crate::task_board) fn pull_request_url(card: &Card) -> Option<String> {
    record::parse(card.delivery_json.as_deref()).and_then(|delivery| delivery.pr_url)
}

fn deliverable(card: &Card) -> bool {
    !card.archived
        && card.column_id == FINAL_REVIEW
        && matches!(card.run_state.as_str(), IDLE | FAILED)
}

fn rejectable(card: &Card) -> bool {
    !card.archived && card.run_state != RUNNING
}

impl Board {
    fn emit_delivery(
        &mut self,
        card_id: String,
        updated_at: i64,
        method: DeliveryMethod,
        cx: &mut Context<Self>,
    ) {
        if self.stage_pending.is_some() {
            return;
        }
        self.stage_pending = Some(card_id.clone());
        self.delivery_open = None;
        cx.emit(Event::Deliver {
            card_id,
            updated_at,
            method,
        });
        cx.notify();
    }

    fn confirm(
        &mut self,
        message: &'static str,
        detail: &'static str,
        ok: &'static str,
        window: &mut Window,
        cx: &mut Context<Self>,
        then: impl FnOnce(&mut Self, &mut Context<Self>) + 'static,
    ) {
        let answer = window.prompt(
            gpui::PromptLevel::Warning,
            message,
            Some(detail),
            &[ok, "Cancel"],
            cx,
        );
        cx.spawn(async move |this, cx| {
            if answer.await == Ok(0) {
                let _ = this.update(cx, then);
            }
        })
        .detach();
    }

    fn method_picker(&self, card: &Card, pending: bool, cx: &mut Context<Self>) -> Div {
        let github = card
            .worktree_path
            .as_ref()
            .and_then(|path| self.github.get(path).copied());
        let mut picker = div().w_full().flex().flex_col().gap_2();
        if github == Some(false) {
            picker = picker.child(div().text_size(px(11.)).text_color(content(0.6)).child(
                "GitHub is not available for this repository, so only Keep branch is offered.",
            ));
        }

        for (method, id, label, hint) in METHODS {
            if github == Some(false) && method != DeliveryMethod::Keep {
                continue;
            }
            let card_id = card.id.clone();
            let updated_at = card.updated_at;
            picker = picker.child(
                modal::disabled(modal::ghost_button(id, label), pending)
                    .debug_selector(move || id.into())
                    .aria_label(format!("{label}. {hint}"))
                    .on_click(cx.listener(move |this, _, window, cx| {
                        let card_id = card_id.clone();
                        if method != DeliveryMethod::Merge {
                            return this.emit_delivery(card_id, updated_at, method, cx);
                        }
                        let then = move |this: &mut Self, cx: &mut Context<Self>| {
                            this.emit_delivery(card_id, updated_at, method, cx)
                        };
                        this.confirm(
                            "Squash-merge",
                            "Open a pull request and squash-merge it now?",
                            "Merge",
                            window,
                            cx,
                            then,
                        );
                    }))
                    .child(
                        div()
                            .text_size(px(11.))
                            .text_color(content(0.5))
                            .child(hint),
                    ),
            );
        }
        picker
    }

    pub(in crate::task_board) fn delivery_actions(
        &self,
        card: &Card,
        cx: &mut Context<Self>,
    ) -> Div {
        let pending = self.stage_pending.as_deref() == Some(&card.id);
        let mut row = div().flex().flex_wrap().gap_2();

        if deliverable(card) {
            if self.delivery_open.as_deref() == Some(&card.id) {
                row = row.child(self.method_picker(card, pending, cx));
            } else {
                let card_id = card.id.clone();
                let worktree = card.worktree_path.clone();
                row = row.child(
                    modal::disabled(modal::primary_button("board-deliver", "Deliver…"), pending)
                        .debug_selector(|| "board-deliver".into())
                        .on_click(cx.listener(move |this, _, _, cx| {
                            this.delivery_open = Some(card_id.clone());
                            if let Some(path) = &worktree {
                                this.probe_github(path.clone(), cx);
                            }
                            cx.notify();
                        })),
                );
            }
        }

        if rejectable(card) {
            let delivered = card.column_id == DONE;
            let (id, label, message, detail) = if delivered {
                (
                    "board-archive",
                    "Archive",
                    "Archive card",
                    "Archive this card? It leaves the board and stays available under Archived.",
                )
            } else {
                (
                    "board-reject",
                    "Reject",
                    "Reject card",
                    "Archive this card? Its worktree is deleted, and its branch too unless it was pushed.",
                )
            };
            let card_id = card.id.clone();
            let updated_at = card.updated_at;
            row = row.child(
                modal::disabled(modal::danger_ghost_button(id, label), pending)
                    .debug_selector(move || id.into())
                    .on_click(cx.listener(move |this, _, window, cx| {
                        let card_id = card_id.clone();
                        let then = move |this: &mut Self, cx: &mut Context<Self>| {
                            if this.stage_pending.is_some() {
                                return;
                            }
                            this.stage_pending = Some(card_id.clone());
                            cx.emit(Event::Reject {
                                card_id,
                                updated_at,
                            });
                            cx.notify();
                        };
                        this.confirm(message, detail, label, window, cx, then);
                    })),
            );
        }
        row
    }

    /// `gh repo view` is a network call: probe off-thread once per worktree.
    fn probe_github(&mut self, path: String, cx: &mut Context<Self>) {
        if self.github.contains_key(&path) {
            return;
        }
        let probe = path.clone();
        let work = cx.background_executor().spawn(async move {
            molfar_core::scm::github_repo(std::path::Path::new(&probe)).is_ok()
        });
        cx.spawn(async move |this, cx| {
            let available = work.await;
            let _ = this.update(cx, |this, cx| {
                this.github.insert(path, available);
                cx.notify();
            });
        })
        .detach();
    }
}
