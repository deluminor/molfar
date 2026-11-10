//! Keeps the tree, graph and stats in step with notes, search and selection.
use super::{Knowledge, graph::GraphEvent, types::GraphStats};
use gpui::{App, Context, Entity};
use molfar_core::knowledge::project_graph;

impl Knowledge {
    pub(super) fn vault_id(&self) -> Option<String> {
        match &self.state {
            molfar_core::knowledge::ConnectionState::Ready(connection) => {
                Some(connection.id.clone())
            }
            _ => None,
        }
    }

    /// The graph's focus: the selected note, only while its panel is open.
    pub(super) fn focus(&self) -> Option<String> {
        self.selected.clone().filter(|_| self.panel_open)
    }

    /// Pushes the focus to the graph; Neighborhood mode re-projects.
    pub(super) fn sync_graph_focus(&mut self, cx: &mut Context<Self>) {
        if self.neighbors_only {
            self.refresh_graph(cx);
        } else {
            let focus = self.focus();
            self.graph
                .update(cx, |graph, cx| graph.set_selected(focus, cx));
        }
    }

    pub(super) fn indexing(&self, cx: &App) -> bool {
        self.busy || self.service.read(cx).scanning()
    }

    /// Re-projects the graph. The selection only shapes the projection in
    /// Neighborhood mode, so plain selection changes never re-layout.
    pub(super) fn refresh_graph(&mut self, cx: &mut Context<Self>) {
        let query = self.filter.read(cx).content.to_string();
        let focus = self.focus();
        let focus = focus.as_deref().filter(|_| self.neighbors_only);
        let projection = project_graph(&self.notes, focus, &query, self.neighbors_only);
        self.stats = GraphStats {
            links: projection.links,
            orphans: projection.orphans,
            missing: projection.missing,
            ambiguous: projection.ambiguous,
        };
        let selected = self.focus();
        let neighbors_only = self.neighbors_only;
        self.graph.update(cx, |graph, cx| {
            graph.set_neighbors_only(neighbors_only, cx);
            graph.set_selected(selected, cx);
            graph.set_projection(projection, cx);
        });
    }

    pub(super) fn on_graph(&mut self, event: &GraphEvent, cx: &mut Context<Self>) {
        match event {
            GraphEvent::Select(path) => self.open_note(path.clone(), cx),
            GraphEvent::ToggleNeighborhood => {
                self.neighbors_only = !self.neighbors_only;
                self.refresh_graph(cx);
                cx.notify();
            }
        }
    }

    pub(super) fn clear_vault(&mut self, cx: &mut Context<Self>) {
        self.notes.clear();
        self.tree_rows.clear();
        self.selected = None;
        self.prepared.clear();
        self.preview_blocks.clear();
        self.relations = Default::default();
        self.properties.clear();
        self.drafts.clear();
        self.error = None;
        self.meta = Default::default();
        self.refresh_graph(cx);
        cx.notify();
    }

    pub(super) fn subscribe_graph(
        graph: &Entity<super::graph::GraphView>,
        cx: &mut Context<Self>,
    ) -> gpui::Subscription {
        cx.subscribe(graph, |this, _, event: &GraphEvent, cx| {
            this.on_graph(event, cx)
        })
    }
}
