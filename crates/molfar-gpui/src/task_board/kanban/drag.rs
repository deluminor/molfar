use super::look::{
    CARD_PAD_LEFT, CARD_PAD_RIGHT, CARD_PAD_Y, CARD_RADIUS, COLUMN_WIDTH, DIMMED, DRAG_FADE,
    EDGE_FRAME, drop_label, edge_scroll_step,
};
use crate::task_board::Board;
use crate::theme::*;
use gpui::{
    Animation, AnimationExt, AnyElement, Context, Div, DragMoveEvent, FontWeight, IntoElement,
    Render, SharedString, Stateful, Window, div, point, prelude::*, px,
};
use molfar_core::task_board::stage::transitions::types::Move;

/// The card lifted under the pointer while it is dragged between columns.
#[derive(Clone)]
pub(in crate::task_board) struct CardDrag {
    pub card_id: String,
    pub number: i64,
    pub title: String,
}

impl Render for CardDrag {
    fn render(&mut self, _: &mut Window, _: &mut Context<Self>) -> impl IntoElement {
        div()
            .w(px(COLUMN_WIDTH - 16.))
            .flex()
            .flex_col()
            .gap_1()
            .py(px(CARD_PAD_Y))
            .pl(px(CARD_PAD_LEFT))
            .pr(px(CARD_PAD_RIGHT))
            .rounded(px(CARD_RADIUS))
            .border_1()
            .border_color(accent_color().opacity(0.5))
            .bg(background_base())
            .shadow_xl()
            .child(
                div()
                    .text_size(px(11.))
                    .text_color(content(0.55))
                    .child(format!("#{}", self.number)),
            )
            .child(
                div()
                    .text_size(px(13.))
                    .font_weight(FontWeight::MEDIUM)
                    .line_clamp(2)
                    .child(self.title.clone()),
            )
    }
}

impl Board {
    /// The dragged card and where it may land, while a drag is in progress.
    pub(super) fn drag_targets(&self, cx: &gpui::App) -> Option<(String, Vec<Move>)> {
        let id = self.dragging.clone().filter(|_| cx.has_active_drag())?;
        let card = self
            .snapshot
            .as_ref()?
            .cards
            .iter()
            .find(|card| card.id == id)?;
        Some((id, self.card_moves(card)))
    }

    pub(super) fn begin_drag(&mut self, card_id: String, cx: &mut Context<Self>) {
        self.dragging = Some(card_id);
        self.drag_over = None;
        self.edge_pointer = None;
        self.drag_sessions += 1;
        cx.spawn(async move |this, cx| {
            loop {
                cx.background_executor().timer(EDGE_FRAME).await;
                let running = this
                    .update(cx, |this, cx| this.edge_tick(cx))
                    .unwrap_or(false);
                if !running {
                    break;
                }
            }
        })
        .detach();
        cx.notify();
    }

    pub(super) fn end_drag(&mut self, cx: &mut Context<Self>) {
        if self.dragging.take().is_some() {
            self.drag_over = None;
            cx.notify();
        }
    }

    pub(super) fn drag_moved(
        &mut self,
        column: &str,
        event: &DragMoveEvent<CardDrag>,
        cx: &mut Context<Self>,
    ) {
        let inside = event.bounds.contains(&event.event.position);
        let over = self.drag_over.as_deref() == Some(column);
        if inside && !over {
            self.drag_over = Some(column.to_owned());
            cx.notify();
        } else if !inside && over {
            self.drag_over = None;
            cx.notify();
        }
    }

    /// Remembers an edge-zone pointer inside the board; a timer keeps scrolling while it rests.
    pub(super) fn edge_scroll(&mut self, event: &DragMoveEvent<CardDrag>, _: &mut Context<Self>) {
        let bounds = event.bounds;
        let position = event.event.position;
        let (x, left, right) = (
            f32::from(position.x),
            f32::from(bounds.left()),
            f32::from(bounds.right()),
        );
        let inside = bounds.contains(&position);
        self.edge_pointer =
            (inside && edge_scroll_step(x, left, right) != 0.).then_some((x, left, right));
    }

    /// One auto-scroll frame; returns whether the drag is still running.
    fn edge_tick(&mut self, cx: &mut Context<Self>) -> bool {
        if self.dragging.is_none() || !cx.has_active_drag() {
            self.edge_pointer = None;
            return false;
        }
        let Some((x, left, right)) = self.edge_pointer else {
            return true;
        };
        let offset = self.scroll.offset();
        let max = f32::from(self.scroll.max_offset().x);
        let next = (f32::from(offset.x) - edge_scroll_step(x, left, right)).clamp(-max, 0.);
        if next != f32::from(offset.x) {
            self.scroll.set_offset(point(px(next), offset.y));
            cx.notify();
        }
        true
    }

    pub(super) fn drop_card(
        &mut self,
        drag: &CardDrag,
        column: &str,
        window: &mut Window,
        cx: &mut Context<Self>,
    ) {
        self.end_drag(cx);
        let Some(card) = self
            .snapshot
            .as_ref()
            .and_then(|snapshot| snapshot.cards.iter().find(|card| card.id == drag.card_id))
            .cloned()
        else {
            return;
        };
        if card.archived {
            return;
        }
        self.apply_move(&card, column, window, cx);
    }

    pub(in crate::task_board) fn cancel_drag(
        &mut self,
        window: &mut Window,
        cx: &mut Context<Self>,
    ) -> bool {
        if self.dragging.is_none() {
            return false;
        }
        cx.stop_active_drag(window);
        self.end_drag(cx);
        true
    }

    /// Frames a column as a legal, hovered or illegal drop target while a card is dragged.
    pub(super) fn drop_zone(
        &self,
        column: Stateful<Div>,
        id: &str,
        targets: Option<&(String, Vec<Move>)>,
        cx: &mut Context<Self>,
    ) -> AnyElement {
        let Some((_, moves)) = targets else {
            return column.into_any_element();
        };
        let target = moves.iter().find(|entry| entry.column == id);
        let over = self.drag_over.as_deref() == Some(id);
        let (moved, dropped) = (id.to_owned(), id.to_owned());
        let mut zone = column
            .on_drag_move::<CardDrag>(
                cx.listener(move |this, event, _, cx| this.drag_moved(&moved, event, cx)),
            )
            .on_drop::<CardDrag>(cx.listener(move |this, drag, window, cx| {
                this.drop_card(drag, &dropped, window, cx)
            }));
        let mut accent = accent_color();

        zone = match (target, over) {
            (Some(_), true) => {
                accent.a = 0.1;
                zone.border_color(accent_color()).bg(accent)
            }
            (Some(_), false) => {
                accent.a = 0.05;
                zone.border_color(accent_color().opacity(0.55)).bg(accent)
            }
            (None, _) => zone,
        };
        if let Some(target) = target {
            zone = zone.child(
                div()
                    .flex_shrink_0()
                    .mx_3()
                    .mb_3()
                    .py_4()
                    .rounded(px(CARD_RADIUS))
                    .border_1()
                    .border_dashed()
                    .border_color(accent_color().opacity(0.5))
                    .flex()
                    .justify_center()
                    .text_size(px(12.))
                    .font_weight(FontWeight::MEDIUM)
                    .text_color(accent_color())
                    .child(drop_label(target.action)),
            );
        }

        let legal = target.is_some();
        if cx.reduce_motion() {
            return zone
                .when(!legal, |zone| zone.opacity(DIMMED))
                .into_any_element();
        }
        zone.with_animation(
            SharedString::from(format!("board-drop-{id}-{}", self.drag_sessions)),
            Animation::new(DRAG_FADE),
            move |zone, t| {
                if legal {
                    zone.opacity(1.)
                } else {
                    zone.opacity(1. - (1. - DIMMED) * t)
                }
            },
        )
        .into_any_element()
    }
}
