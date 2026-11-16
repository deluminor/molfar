use super::super::{Board, Event};
use super::delivery::rejectable;
use super::footer::{danger_quiet_button, quiet_button};
use crate::modal;
use gpui::{AnyElement, Context, prelude::*};
use molfar_core::task_board::{constants::DONE, types::Card};

impl Board {
    pub(super) fn reject_action(
        &self,
        card: &Card,
        pending: bool,
        cx: &mut Context<Self>,
    ) -> Option<AnyElement> {
        if !rejectable(card) {
            return None;
        }
        let delivered = card.column_id == DONE;
        let (id, glyph, label, message, detail) = if delivered {
            (
                "board-archive",
                "archive",
                "Archive",
                "Archive card",
                "Archive this card? It leaves the board and stays available under Archived.",
            )
        } else {
            (
                "board-reject",
                "x",
                "Reject",
                "Reject card",
                "Archive this card? Its worktree is deleted, and its branch too unless it was pushed.",
            )
        };
        let card_id = card.id.clone();
        let updated_at = card.updated_at;
        let button = if delivered {
            quiet_button(id, glyph, label)
        } else {
            danger_quiet_button(id, glyph, label)
        };
        Some(
            modal::disabled(button, pending)
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
                }))
                .into_any_element(),
        )
    }
}
