use super::{Board, kanban::OTHER_COLUMN};
use crate::host_pane::HostPane;
use gpui::{AnyElement, AppContext, Context, Entity, IntoElement, ParentElement, Styled, div};
use molfar_core::task_board::constants::COLUMNS;

/// The open card's body, its own view so its scroll repaints only itself.
pub(super) type DetailPane = HostPane<Board>;

/// One kanban column, cached so a Board render it did not cause reuses it.
pub(super) type ColumnPanes = std::collections::HashMap<String, Entity<HostPane<Board>>>;

pub(super) fn build(cx: &mut Context<Board>) -> (Entity<DetailPane>, ColumnPanes) {
    let board = cx.entity();
    let detail = cx.new(|cx| {
        HostPane::new(
            &board,
            |board, _, cx| {
                div()
                    .size_full()
                    .flex()
                    .child(board.detail(cx))
                    .into_any_element()
            },
            cx,
        )
    });
    let columns = COLUMNS
        .iter()
        .map(|(column, _)| *column)
        .chain([OTHER_COLUMN])
        .map(|column| {
            let key = column.to_owned();
            let pane = cx.new(|cx| {
                HostPane::new(
                    &board,
                    move |board, _, cx| board.kanban_column_zone(&key, cx),
                    cx,
                )
            });
            (column.to_owned(), pane)
        })
        .collect();

    (detail, columns)
}

impl Board {
    pub(super) fn cached_detail(&self) -> AnyElement {
        self.detail_pane
            .clone()
            .cached(gpui::StyleRefinement::default().size_full())
            .into_any_element()
    }
}
