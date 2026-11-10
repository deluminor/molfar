//! Chrome floating over the graph: note labels, folder legend, controls,
//! interaction hint and the layout loader.
use super::{GraphEvent, GraphView, frame::Frame};
use crate::{knowledge::loading::orbit_loader, theme::*};
use gpui::{AnyElement, Context, FontWeight, Role, div, prelude::*, px};

const LABEL_LIMIT: usize = 24;
const LEGEND_LIMIT: usize = 6;

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
    pub(super) fn labels(&self, frame: &Frame, selected: Option<usize>) -> Vec<AnyElement> {
        let mut wanted: Vec<usize> = self.hovered.into_iter().chain(selected).collect();
        if let Some(index) = selected.or(self.hovered) {
            let mut neighbors: Vec<usize> = self.shown.neighbors(index).into_iter().collect();
            neighbors.sort_by_key(|index| std::cmp::Reverse(self.shown.nodes[*index].degree));
            wanted.extend(neighbors);
        } else if self.shown.nodes.len() <= 400 {
            wanted.extend(0..self.shown.nodes.len().min(8));
        }
        let mut seen = std::collections::HashSet::new();
        wanted.retain(|index| seen.insert(*index));

        wanted
            .into_iter()
            .take(LABEL_LIMIT)
            .filter_map(|index| {
                let item = frame.projected.get(index).copied().flatten()?;
                let node = self.shown.nodes.get(index)?;
                let focused = Some(index) == self.hovered || Some(index) == selected;
                let radius = frame.radii.get(index).copied().unwrap_or(4.);
                Some(
                    div()
                        .absolute()
                        .left(px(item.x + radius + 6.))
                        .top(px(item.y - 10.))
                        .max_w(px(220.))
                        .truncate()
                        .px_1p5()
                        .py(px(2.))
                        .rounded_sm()
                        .bg(floating_fill().opacity(if focused { 0.92 } else { 0.6 }))
                        .text_size(px(if focused { 12. } else { 11. }))
                        .when(focused, |label| label.font_weight(FontWeight::MEDIUM))
                        .text_color(content(if focused { 0.95 } else { 0.6 }))
                        .child(node.title.clone())
                        .into_any_element(),
                )
            })
            .collect()
    }

    pub(super) fn legend(&self) -> impl IntoElement {
        let light = is_light();
        let groups = &self.palette.ranked;
        let more = groups.len().saturating_sub(LEGEND_LIMIT);
        div()
            .absolute()
            .top_3()
            .left_3()
            .flex()
            .flex_col()
            .gap_1()
            .text_size(px(11.))
            .text_color(content(0.55))
            .children(groups.iter().take(LEGEND_LIMIT).map(|(group, count)| {
                div()
                    .flex()
                    .items_center()
                    .gap_1p5()
                    .child(
                        div()
                            .size(px(7.))
                            .rounded_full()
                            .bg(self.palette.color(group, light)),
                    )
                    .child(if group.is_empty() {
                        "Vault root".to_string()
                    } else {
                        group.clone()
                    })
                    .child(div().text_color(content(0.3)).child(count.to_string()))
            }))
            .when(more > 0, |legend| {
                legend.child(
                    div()
                        .text_color(content(0.3))
                        .child(format!("+{more} more folders")),
                )
            })
    }

    pub(super) fn controls(&self, cx: &mut Context<Self>) -> impl IntoElement {
        div()
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
