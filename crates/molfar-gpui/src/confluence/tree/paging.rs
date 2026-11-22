//! Loading a branch's next page once its loaded tail scrolls into view.
use std::ops::Range;

use gpui::Context;

use super::super::View;

/// Rows below the viewport that still count as "near the end" for paging.
const PAGE_LOOKAHEAD: usize = 2;

impl View {
    /// The deepest branch whose loaded tail sits at the bottom of `visible`
    /// and still has a next page. Only the rows around the viewport end are
    /// checked, so this costs the same for ten rows or ten thousand.
    pub(in crate::confluence) fn page_candidate(&self, visible: Range<usize>) -> Option<String> {
        if !self.query.trim().is_empty() || self.tree_rows.is_empty() {
            return None;
        }
        let count = self.tree_rows.len();
        let end = (visible.end + PAGE_LOOKAHEAD).min(count);
        let start = if visible.end >= count {
            visible.start
        } else {
            visible
                .end
                .saturating_sub(PAGE_LOOKAHEAD + 1)
                .max(visible.start)
        };
        self.tree_rows[start..end]
            .iter()
            .filter(|row| {
                row.last
                    && !self.pending.contains(&row.parent)
                    && self
                        .branches
                        .get(&row.parent)
                        .is_some_and(|branch| branch.cursor.is_some())
            })
            .max_by_key(|row| row.depth)
            .map(|row| row.parent.clone())
    }

    pub(super) fn page_branch(&mut self, parent: String, cx: &mut Context<Self>) {
        if parent.is_empty() {
            self.load_children(None, false, cx);
            return;
        }
        let Some(kind) = self
            .tree_rows
            .iter()
            .find(|row| row.node.id == parent)
            .map(|row| row.node.kind)
        else {
            return;
        };
        self.load_children(Some((parent, kind)), false, cx);
    }
}
