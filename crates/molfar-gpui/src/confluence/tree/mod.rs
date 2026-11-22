use gpui::{Context, ScrollStrategy};
use molfar_core::confluence::{
    config,
    connector::{Kind, Node},
};

mod paging;
pub(super) mod panel;

use super::View;
use crate::runtime::locked;

#[derive(Clone)]
pub(super) struct Row {
    pub node: Node,
    pub parent: String,
    pub depth: usize,
    /// The last loaded child of `parent`, where its next page starts.
    pub last: bool,
}

impl View {
    pub(super) fn select_space(
        &mut self,
        id: Option<String>,
        refresh: bool,
        cx: &mut Context<Self>,
    ) {
        self.tree_generation += 1;
        self.page_generation += 1;
        self.selected_space = id;
        self.branches.clear();
        self.expanded.clear();
        self.pending.clear();
        self.selected_node = None;
        self.document = None;
        self.selection_source = None;
        self.reading = false;
        self.cursor_row = 0;
        self.tree_scroll.scroll_to_item(0, ScrollStrategy::Top);
        self.rebuild_rows();
        if self.active_space().is_some() {
            self.load_children(None, refresh, cx);
        }
        cx.notify();
    }

    pub(super) fn load_children(
        &mut self,
        parent: Option<(String, Kind)>,
        refresh: bool,
        cx: &mut Context<Self>,
    ) {
        let Some(space) = self.active_space().cloned() else {
            return;
        };
        let key = parent
            .as_ref()
            .map(|(id, _)| id.clone())
            .unwrap_or_default();
        let cursor = self
            .branches
            .get(&key)
            .and_then(|branch| branch.cursor.clone());
        if (self.branches.contains_key(&key) && cursor.is_none())
            || !self.pending.insert(key.clone())
        {
            return;
        }

        let generation = self.tree_generation;
        let service = self.service.clone();
        let job = cx.background_executor().spawn(async move {
            service
                .connector()?
                .children(
                    &space,
                    parent.as_ref().map(|(id, kind)| (id.as_str(), *kind)),
                    cursor.as_deref(),
                    refresh,
                )
                .map_err(|error| error.to_string())
        });
        cx.spawn(async move |view, cx| {
            let result = job.await;
            let _ = view.update(cx, |this, cx| {
                if this.tree_generation != generation {
                    return;
                }
                this.pending.remove(&key);
                match result {
                    Ok(result) => {
                        let branch = this.branches.entry(key).or_default();
                        let seen: std::collections::HashSet<_> =
                            branch.nodes.iter().map(|node| node.id.clone()).collect();
                        branch.nodes.extend(
                            result
                                .nodes
                                .into_iter()
                                .filter(|node| !seen.contains(&node.id)),
                        );
                        if result.cursor != branch.cursor {
                            branch.cursor = result.cursor;
                        } else {
                            branch.cursor = None;
                        }
                    }
                    Err(error) => {
                        // Stop paging this branch until a refresh, or a
                        // visible failing tail would retry every frame.
                        if let Some(branch) = this.branches.get_mut(&key) {
                            branch.cursor = None;
                        }
                        this.failure(error);
                    }
                }
                this.rebuild_rows();
                cx.notify();
            });
        })
        .detach();
    }

    pub(super) fn rows(&self) -> &[Row] {
        &self.tree_rows
    }

    /// Flattens the tree once per change; frames only read the cached rows.
    pub(super) fn rebuild_rows(&mut self) {
        let mut rows = Vec::new();
        if self.query.trim().is_empty() {
            self.append_rows("", 0, &mut rows);
        } else {
            rows.extend(self.results.iter().cloned().map(|node| Row {
                node,
                depth: 0,
                parent: String::new(),
                last: false,
            }));
        }
        self.cursor_row = self.cursor_row.min(rows.len().saturating_sub(1));
        self.tree_rows = rows;
    }

    fn append_rows(&self, key: &str, depth: usize, rows: &mut Vec<Row>) {
        if depth >= 64 {
            return;
        }
        if let Some(branch) = self.branches.get(key) {
            let count = branch.nodes.len();
            for (index, node) in branch.nodes.iter().enumerate() {
                rows.push(Row {
                    node: node.clone(),
                    depth,
                    parent: key.into(),
                    last: index + 1 == count,
                });
                if self.expanded.contains(&node.id) {
                    self.append_rows(&node.id, depth + 1, rows);
                }
            }
        }
    }

    pub(super) fn expand(&mut self, node: &Node, cx: &mut Context<Self>) {
        if self.query.trim().is_empty()
            && matches!(node.kind, Kind::Page | Kind::Folder)
            && self.expanded.insert(node.id.clone())
        {
            if !self.branches.contains_key(&node.id) {
                self.load_children(Some((node.id.clone(), node.kind)), false, cx);
            }
            self.rebuild_rows();
            cx.notify();
        }
    }

    pub(super) fn collapse(&mut self, id: &str, cx: &mut Context<Self>) -> bool {
        let removed = self.expanded.remove(id);
        if removed {
            self.rebuild_rows();
            cx.notify();
        }
        removed
    }

    pub(super) fn tree_key(&mut self, key: &str, cx: &mut Context<Self>) -> bool {
        let rows = &self.tree_rows;
        let Some(row) = rows
            .get(self.cursor_row.min(rows.len().saturating_sub(1)))
            .cloned()
        else {
            return false;
        };
        let count = rows.len();
        match key {
            "up" => self.cursor_row = self.cursor_row.saturating_sub(1),
            "down" => self.cursor_row = (self.cursor_row + 1).min(count - 1),
            "left" => {
                if !self.collapse(&row.node.id, cx)
                    && let Some(parent) = self
                        .tree_rows
                        .iter()
                        .position(|candidate| candidate.node.id == row.parent)
                {
                    self.cursor_row = parent;
                }
            }
            "right" => self.expand(&row.node, cx),
            "enter" => self.select_node(row.node.clone(), cx),
            _ => return false,
        }

        self.tree_scroll
            .scroll_to_item(self.cursor_row, ScrollStrategy::Nearest);
        cx.notify();
        true
    }

    pub(super) fn toggle_hidden(&mut self, id: String, cx: &mut Context<Self>) {
        let mut hidden = self.hidden.clone();
        if !hidden.remove(&id) {
            hidden.insert(id);
        }
        let result = locked(&self.service.database)
            .and_then(|store| config::set_hidden_spaces(&store, &hidden));
        match result {
            Ok(()) => {
                self.hidden = hidden;
                if self
                    .selected_space
                    .as_ref()
                    .is_some_and(|id| self.hidden.contains(id))
                {
                    let next = self
                        .spaces
                        .iter()
                        .find(|space| !self.hidden.contains(&space.id))
                        .map(|space| space.id.clone());
                    self.select_space(next, false, cx);
                }
                self.search(cx);
            }
            Err(error) => self.failure(error),
        }
        cx.notify();
    }
}
