use super::{Board, kanban::OTHER_COLUMN};
use gpui::{
    AnyElement, AppContext, Context, Entity, IntoElement, ParentElement, Render, Styled,
    Subscription, WeakEntity, Window, div,
};
use molfar_core::task_board::constants::COLUMNS;

// A cached child view is not dirtied by its parent's notify, so each pane
// re-renders on every Board notify through this observer instead.
fn observe_board<T: 'static>(board: &Entity<Board>, cx: &mut Context<T>) -> Subscription {
    cx.observe(board, |_, _, cx| cx.notify())
}

/// The open card's body, its own view so its scroll repaints only itself.
pub(super) struct DetailPane {
    board: WeakEntity<Board>,
    _board: Subscription,
    #[cfg(test)]
    pub(super) renders: usize,
}

impl DetailPane {
    pub(super) fn new(board: &Entity<Board>, cx: &mut Context<Self>) -> Self {
        Self {
            board: board.downgrade(),
            _board: observe_board(board, cx),
            #[cfg(test)]
            renders: 0,
        }
    }
}

impl Render for DetailPane {
    fn render(&mut self, _: &mut Window, cx: &mut Context<Self>) -> impl IntoElement {
        #[cfg(test)]
        {
            self.renders += 1;
        }
        let body = self
            .board
            .update(cx, |board, cx| board.detail(cx))
            .unwrap_or_else(|_| div().into_any_element());

        div().size_full().flex().child(body)
    }
}

/// One kanban column, cached so a Board render it did not cause reuses it.
pub(super) struct ColumnPane {
    board: WeakEntity<Board>,
    column: String,
    _board: Subscription,
    #[cfg(test)]
    pub(super) renders: usize,
}

impl ColumnPane {
    pub(super) fn new(board: &Entity<Board>, column: String, cx: &mut Context<Self>) -> Self {
        Self {
            board: board.downgrade(),
            column,
            _board: observe_board(board, cx),
            #[cfg(test)]
            renders: 0,
        }
    }
}

impl Render for ColumnPane {
    fn render(&mut self, _: &mut Window, cx: &mut Context<Self>) -> impl IntoElement {
        #[cfg(test)]
        {
            self.renders += 1;
        }
        self.board
            .update(cx, |board, cx| board.kanban_column_zone(&self.column, cx))
            .unwrap_or_else(|_| div().into_any_element())
    }
}

pub(super) type ColumnPanes = std::collections::HashMap<String, Entity<ColumnPane>>;

// Panes are built with the Board, outside any frame: an entity created during
// a draw is missing from the accessed set its cached view records, so its own
// notify would never reach the window afterwards.
pub(super) fn build(cx: &mut Context<Board>) -> (Entity<DetailPane>, ColumnPanes) {
    let board = cx.entity();
    let detail = cx.new(|cx| DetailPane::new(&board, cx));
    let columns = COLUMNS
        .iter()
        .map(|(column, _)| *column)
        .chain([OTHER_COLUMN])
        .map(|column| {
            let pane = cx.new(|cx| ColumnPane::new(&board, column.to_owned(), cx));
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
