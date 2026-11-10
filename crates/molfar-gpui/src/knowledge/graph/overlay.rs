//! Chrome floating over the graph: note labels, controls,
//! interaction hint and the layout loader.
use super::{
    GraphEvent, GraphView,
    frame::Frame,
    labels::{Rect, label_rect, place},
};
use crate::{knowledge::loading::orbit_loader, theme::*};
use gpui::{AnyElement, Context, FontWeight, Role, div, prelude::*, px};

const LABEL_LIMIT: usize = 28;
/// Hub names shown when nothing is open.
const HUB_LABELS: usize = 10;

fn chip(
    id: &'static str,
    label: &'static str,
    glyph: &'static str,
    active: bool,
) -> gpui::Stateful<gpui::Div> {
    div()
        .id(id)
        .debug_selector(move || id.to_string())
        .role(Role::Button)
        .aria_label(label)
        .cursor_pointer()
        .h(px(28.))
        .px_2p5()
        .flex()
        .items_center()
        .gap_1p5()
        .rounded_md()
        .border_1()
        .border_color(if active {
            accent_color().opacity(0.5)
        } else {
            content(0.1)
        })
        .bg(floating_fill().opacity(0.85))
        .text_size(px(12.))
        .text_color(if active { accent_color() } else { content(0.7) })
        .hover(|style| style.bg(content(0.1)).text_color(content(1.)))
        .child(icon(glyph, 13.).text_color(if active {
            accent_color()
        } else {
            content(0.55)
        }))
        .child(label)
}

impl GraphView {
    /// Names worth showing, most important first: the open note, the hovered
    /// note, the open note's links by weight, then the vault's hubs.
    fn label_order(&self, selected: Option<usize>) -> Vec<usize> {
        let by_weight = |indices: &mut Vec<usize>| {
            indices.sort_by_key(|index| std::cmp::Reverse(self.shown.nodes[*index].degree));
        };
        let mut wanted: Vec<usize> = selected.into_iter().chain(self.hovered).collect();
        if let Some(index) = selected {
            let mut neighbors: Vec<usize> = self.shown.neighbors(index).into_iter().collect();
            by_weight(&mut neighbors);
            wanted.extend(neighbors);
        } else {
            let mut hubs: Vec<usize> = (0..self.shown.nodes.len()).collect();
            by_weight(&mut hubs);
            wanted.extend(hubs.into_iter().take(HUB_LABELS));
        }
        let mut seen = std::collections::HashSet::new();
        wanted.retain(|index| seen.insert(*index));
        wanted.truncate(LABEL_LIMIT);
        wanted
    }

    pub(super) fn labels(&self, frame: &Frame, selected: Option<usize>) -> Vec<AnyElement> {
        let candidates: Vec<(usize, f32, f32, bool)> = self
            .label_order(selected)
            .into_iter()
            .filter_map(|index| {
                let item = frame.projected.get(index).copied().flatten()?;
                let radius = frame.radii.get(index).copied().unwrap_or(4.);
                let focused = Some(index) == self.hovered || Some(index) == selected;
                Some((index, item.x + radius + 6., item.y, focused))
            })
            .collect();
        let rects: Vec<Rect> = candidates
            .iter()
            .map(|(index, x, y, focused)| {
                let size = if *focused { 12. } else { 11. };
                label_rect(
                    *x,
                    *y,
                    &self.shown.nodes[*index].title,
                    size,
                    if *focused { 6. } else { 0. },
                )
            })
            .collect();
        let shown = place(&rects);

        candidates
            .into_iter()
            .zip(rects)
            .zip(shown)
            .filter(|(_, keep)| *keep)
            .map(|(((index, _, _, focused), rect), _)| {
                div()
                    .absolute()
                    .left(px(rect.x))
                    .top(px(rect.y))
                    .h(px(rect.height))
                    .max_w(px(232.))
                    .flex()
                    .items_center()
                    .truncate()
                    .text_size(px(if focused { 12. } else { 11. }))
                    .when(focused, |label| {
                        label
                            .px_1p5()
                            .rounded_md()
                            .bg(floating_fill().opacity(0.88))
                            .font_weight(FontWeight::MEDIUM)
                            .text_color(content(0.95))
                    })
                    .when(!focused, |label| label.text_color(content(0.5)))
                    .child(self.shown.nodes[index].title.clone())
                    .into_any_element()
            })
            .collect()
    }

    pub(super) fn controls(&self, cx: &mut Context<Self>) -> impl IntoElement {
        div()
            .id("knowledge-graph-controls")
            .occlude()
            .absolute()
            .top_3()
            .right_3()
            .flex()
            .gap_1p5()
            .child(
                chip(
                    "knowledge-graph-neighborhood",
                    if self.neighbors_only {
                        "Neighborhood"
                    } else {
                        "All notes"
                    },
                    "share",
                    self.neighbors_only,
                )
                .on_click(cx.listener(|_, _, _, cx| cx.emit(GraphEvent::ToggleNeighborhood))),
            )
            .child(
                chip(
                    "knowledge-graph-spin",
                    "Rotate",
                    "rotate-ccw",
                    self.spinning,
                )
                .on_click(cx.listener(|this, _, _, cx| {
                    this.spinning = !this.spinning;
                    cx.notify();
                })),
            )
            .child(
                chip("knowledge-graph-fit", "Fit", "window-maximize", false)
                    .on_click(cx.listener(|this, _, _, cx| this.fit(cx))),
            )
    }

    pub(super) fn hint(&self) -> impl IntoElement {
        div()
            .absolute()
            .bottom_3()
            .left_3()
            .flex()
            .flex_col()
            .gap_0p5()
            .child(
                div()
                    .text_size(px(12.))
                    .text_color(content(0.7))
                    .child("Explore connections"),
            )
            .child(
                div()
                    .text_size(px(10.))
                    .text_color(content(0.4))
                    .child("Drag to orbit · Scroll to zoom · Click a note to open it"),
            )
    }

    pub(super) fn loader(&self) -> Option<AnyElement> {
        let pending = self
            .pending
            .as_ref()
            .filter(|_| self.shown.nodes.is_empty())?;
        Some(
            div()
                .absolute()
                .inset_0()
                .flex()
                .items_center()
                .justify_center()
                .child(orbit_loader(
                    "knowledge-graph-layout",
                    "Arranging your graph…".into(),
                    Some(format!(
                        "{} notes · {} links",
                        pending.nodes.len(),
                        pending.edges.len()
                    )),
                ))
                .into_any_element(),
        )
    }
}
