mod card;
mod column;
mod drag;
#[cfg(test)]
mod drag_tests;
mod drawer;
pub(super) mod look;
mod nav;
mod running;
#[cfg(test)]
mod running_tests;
pub(super) mod scroll;
#[cfg(test)]
mod scroll_tests;
pub(super) mod status;
#[cfg(test)]
mod tests;

use super::Board;
use gpui::{AnyElement, Context, ScrollHandle, div, prelude::*, px};
use molfar_core::task_board::{constants::COLUMNS, stage::agent::AgentStage, types::Card};

pub(super) const OTHER_COLUMN: &str = "other";

impl Board {
    pub(in crate::task_board) fn column_anchor(
        &self,
        stage: AgentStage,
    ) -> crate::popover::AnchorSlot {
        self.column_anchors
            .iter()
            .find(|(entry, _)| *entry == stage)
            .map(|(_, anchor)| anchor.clone())
            .unwrap_or_default()
    }

    pub(super) fn column_scroll(&self, column: &str) -> ScrollHandle {
        self.column_scrolls
            .borrow_mut()
            .entry(column.to_owned())
            .or_default()
            .clone()
    }

    /// Cards in board order: the known columns, then any column from a newer version.
    pub(super) fn board_columns(&self) -> Vec<(String, String, Vec<&Card>)> {
        let Some(snapshot) = &self.snapshot else {
            return Vec::new();
        };
        let mut columns: Vec<(String, String, Vec<&Card>)> = COLUMNS
            .iter()
            .map(|(id, label)| {
                let cards = snapshot
                    .cards
                    .iter()
                    .filter(|card| card.column_id == *id)
                    .collect();
                ((*id).to_owned(), (*label).to_owned(), cards)
            })
            .collect();
        let other: Vec<&Card> = snapshot
            .cards
            .iter()
            .filter(|card| !COLUMNS.iter().any(|(id, _)| *id == card.column_id))
            .collect();
        if !other.is_empty() {
            columns.push((OTHER_COLUMN.to_owned(), "Other columns".to_owned(), other));
        }
        columns
    }

    pub(super) fn kanban(&self, cx: &mut Context<Self>) -> AnyElement {
        let mut row = div()
            .id("board-list")
            .debug_selector(|| "board-list".into())
            .role(gpui::Role::Group)
            .aria_label("Task Board columns")
            .h_full()
            .flex_1()
            .min_w_0()
            .flex()
            .gap_3()
            .p_3()
            .overflow_x_scroll()
            .restrict_scroll_to_axis()
            .track_scroll(&self.scroll);
        let empty = self
            .snapshot
            .as_ref()
            .is_some_and(|snapshot| snapshot.cards.is_empty());

        let targets = self.drag_targets(cx);
        row = row.on_drag_move::<drag::CardDrag>(
            cx.listener(|this, event, _, cx| this.edge_scroll(event, cx)),
        );
        for (column, label, cards) in self.board_columns() {
            let scroll = self.column_scroll(&column);
            let element = self.kanban_column(&column, &label, &cards, &scroll, cx);
            row = row.child(self.drop_zone(element, &column, targets.as_ref(), cx));
        }
        div()
            .id("board-workspace")
            .debug_selector(|| "board-workspace".into())
            .relative()
            .flex()
            .flex_1()
            .min_w_0()
            .min_h_0()
            .overflow_hidden()
            .child(
                div()
                    .flex_1()
                    .min_w_0()
                    .h_full()
                    .flex()
                    .flex_col()
                    .child(row)
                    .child(self.board_scrollbar(cx)),
            )
            .when(empty, |board| {
                board.child(
                    div()
                        .id("board-empty")
                        .debug_selector(|| "board-empty".into())
                        .absolute()
                        .bottom(px(16.))
                        .left(px(16.))
                        .text_size(px(12.))
                        .text_color(crate::theme::content(0.5))
                        .child("No cards match these filters."),
                )
            })
            .when_some(self.detail_drawer(cx), |board, drawer| board.child(drawer))
            .into_any_element()
    }
}
