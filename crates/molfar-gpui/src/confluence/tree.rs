use gpui::{Context, px};
use molfar_core::confluence::{
    config,
    connector::{Kind, Node},
};

use super::View;
use crate::runtime::locked;

#[derive(Clone)]
pub(super) struct Row {
    pub node: Node,
    pub parent: String,
    pub depth: usize,
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
        self.tree_scroll.set_offset(gpui::point(px(0.), px(0.)));
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
                    Err(error) => this.failure(error),
                }
                cx.notify();
            });
        })
        .detach();
    }

    pub(super) fn rows(&self) -> Vec<Row> {
        if !self.query.trim().is_empty() {
            return self
                .results
                .iter()
                .cloned()
                .map(|node| Row {
                    node,
                    depth: 0,
                    parent: String::new(),
                })
                .collect();
        }

        let mut rows = Vec::new();
        self.append_rows("", 0, &mut rows);
        rows
    }

    fn append_rows(&self, key: &str, depth: usize, rows: &mut Vec<Row>) {
        if depth >= 64 {
            return;
        }
        if let Some(branch) = self.branches.get(key) {
            for node in &branch.nodes {
                rows.push(Row {
                    node: node.clone(),
                    depth,
                    parent: key.into(),
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
            cx.notify();
        }
    }

    pub(super) fn collapse(&mut self, id: &str, cx: &mut Context<Self>) -> bool {
        let removed = self.expanded.remove(id);
        if removed {
            cx.notify();
        }
        removed
    }

    pub(super) fn tree_key(&mut self, key: &str, cx: &mut Context<Self>) -> bool {
        let rows = self.rows();
        let Some(row) = rows.get(self.cursor_row.min(rows.len().saturating_sub(1))) else {
            return false;
        };
        match key {
            "up" => self.cursor_row = self.cursor_row.saturating_sub(1),
            "down" => self.cursor_row = (self.cursor_row + 1).min(rows.len() - 1),
            "left" => {
                if !self.collapse(&row.node.id, cx)
                    && let Some(parent) = rows
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

        self.tree_scroll.scroll_to_item(self.cursor_row);
        cx.notify();
        true
    }

    pub(super) fn tree_scrolled(&mut self, cx: &mut Context<Self>) {
        if !self.query.trim().is_empty() {
            return;
        }
        let offset = self.tree_scroll.offset().y.abs();
        if self.tree_scroll.max_offset().y.abs() - offset > px(64.) {
            return;
        }

        let tail = self
            .rows()
            .last()
            .map(|row| row.parent.clone())
            .unwrap_or_default();
        if !tail.is_empty()
            && self
                .branches
                .get(&tail)
                .is_some_and(|branch| branch.cursor.is_some())
            && let Some(row) = self.rows().into_iter().find(|row| row.node.id == tail)
        {
                self.load_children(Some((tail, row.node.kind)), false, cx);
                return;
        }
        if self
            .branches
            .get("")
            .is_some_and(|branch| branch.cursor.is_some())
        {
            self.load_children(None, false, cx);
        }
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
