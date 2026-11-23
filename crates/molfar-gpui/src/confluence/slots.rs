//! Confluence's tree and page as two cached views for a host such as the
//! Inbox: one pane's scroll or redraw leaves the other's layout alone.
use gpui::{AnyElement, App, AppContext, Entity, IntoElement, StyleRefinement, Styled};

use super::View;
use crate::host_pane::HostPane;

pub(crate) struct Slots {
    tree: Entity<HostPane<View>>,
    reader: Entity<HostPane<View>>,
}

impl Slots {
    pub(crate) fn new(view: &Entity<View>, cx: &mut App) -> Self {
        Self {
            tree: cx.new(|cx| HostPane::new(view, |view, _, cx| view.tree_pane(cx), cx)),
            reader: cx.new(|cx| HostPane::new(view, |view, _, cx| view.reader_view(cx), cx)),
        }
    }

    /// Both panes size themselves with `flex_1`, so each cached view is a
    /// flex column the way their inline parent was.
    fn style() -> StyleRefinement {
        StyleRefinement::default()
            .flex_1()
            .min_h_0()
            .w_full()
            .flex()
            .flex_col()
    }

    pub(crate) fn tree(&self) -> AnyElement {
        self.tree.clone().cached(Self::style()).into_any_element()
    }

    pub(crate) fn reader(&self) -> AnyElement {
        self.reader
            .clone()
            .cached(Self::style().h_full())
            .into_any_element()
    }
}
