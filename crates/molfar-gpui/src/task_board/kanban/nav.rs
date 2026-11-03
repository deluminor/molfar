use super::super::Board;
use gpui::Context;

impl Board {
    pub(in crate::task_board) fn select(&mut self, id: String, cx: &mut Context<Self>) {
        if self.selected.as_ref() == Some(&id) {
            return;
        }
        if self.selected.is_none() {
            self.drawer_opens += 1;
        }
        self.selected = Some(id);
        self.refresh(cx);
    }

    pub(in crate::task_board) fn close_detail(&mut self, cx: &mut Context<Self>) {
        if self.selected.take().is_some() {
            self.refresh(cx);
        }
        cx.notify();
    }

    /// `(column index, card index)` of the selection in board order.
    fn selection_position(&self) -> Option<(usize, usize)> {
        let selected = self.selected.as_ref()?;
        self.board_columns()
            .iter()
            .enumerate()
            .find_map(|(column, (_, _, cards))| {
                cards
                    .iter()
                    .position(|card| &card.id == selected)
                    .map(|index| (column, index))
            })
    }

    pub(in crate::task_board) fn reveal_selection(&self) {
        let Some((column, index)) = self.selection_position() else {
            return;
        };
        let columns = self.board_columns();
        self.scroll.scroll_to_item(column);
        self.column_scroll(&columns[column].0).scroll_to_item(index);
    }

    pub(in crate::task_board) fn move_selection(&mut self, down: bool, cx: &mut Context<Self>) {
        let Some((column, index)) = self.selection_position() else {
            return;
        };
        let columns = self.board_columns();
        let cards = &columns[column].2;
        let next = if down {
            (index + 1).min(cards.len() - 1)
        } else {
            index.saturating_sub(1)
        };
        let id = cards[next].id.clone();
        self.select(id, cx);
    }

    /// Left/right jump to the nearest non-empty column, keeping the row when it exists.
    pub(in crate::task_board) fn move_column(&mut self, right: bool, cx: &mut Context<Self>) {
        let Some((column, index)) = self.selection_position() else {
            return;
        };
        let columns = self.board_columns();
        let candidates: Vec<usize> = if right {
            (column + 1..columns.len()).collect()
        } else {
            (0..column).rev().collect()
        };
        let Some(target) = candidates
            .into_iter()
            .find(|entry| !columns[*entry].2.is_empty())
        else {
            return;
        };
        let cards = &columns[target].2;
        let id = cards[index.min(cards.len() - 1)].id.clone();
        self.select(id, cx);
    }
}
