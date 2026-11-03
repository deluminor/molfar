use super::{
    drag::CardDrag,
    look::{
        CARD_PAD_LEFT, CARD_PAD_RIGHT, CARD_PAD_Y, CARD_RADIUS, REWORK_WARNING_CYCLE, SOURCE_FADE,
        amber,
    },
    status::{chip, status, stripe},
};
use crate::task_board::Board;
use crate::theme::*;
use gpui::{AnyElement, AppContext, Context, FontWeight, Role, SharedString, div, prelude::*, px};
use molfar_core::task_board::{
    stage::{checkout::constants::TASK_BRANCH_PREFIX, lifecycle::constants::FAILED},
    types::Card,
};

fn project_name(path: &str) -> &str {
    path.trim_end_matches('/')
        .rsplit('/')
        .next()
        .unwrap_or(path)
}

/// Drops the `molfar/task-<id>-` prefix so the readable slug remains.
fn short_branch(branch: &str) -> &str {
    let Some(rest) = branch.strip_prefix(TASK_BRANCH_PREFIX) else {
        return branch;
    };
    let slug = rest.split_once('-').map_or("", |(_, slug)| slug);
    if slug.is_empty() { branch } else { slug }
}

fn pill(fill: gpui::Hsla, ink: gpui::Hsla) -> gpui::Div {
    div()
        .h(px(20.))
        .px(px(6.))
        .rounded(px(6.))
        .flex()
        .items_center()
        .gap_1()
        .text_size(px(11.))
        .bg(fill)
        .text_color(ink)
}

impl Board {
    pub(super) fn kanban_card(&self, card: &Card, cx: &mut Context<Self>) -> AnyElement {
        let id = card.id.clone();
        let selector = format!("board-card-{id}");
        let selected = self.selected.as_ref() == Some(&id);
        let state = status(card);
        let label = match state {
            Some((_, text)) => format!("#{} {}, {text}", card.number, card.title),
            None => format!("#{} {}", card.number, card.title),
        };

        let mut footer = div()
            .min_h(px(20.))
            .flex()
            .flex_wrap()
            .items_center()
            .gap_1p5();
        if let Some((kind, text)) = state {
            let (fill, ink) = chip(kind);
            footer = footer.child(pill(fill, ink).child(text));
        }
        if card.rework_cycle > 0 {
            let warning = card.rework_cycle >= REWORK_WARNING_CYCLE;
            let (fill, ink) = if warning {
                (amber(0.1), amber(1.))
            } else {
                (content(0.06), content(0.55))
            };
            footer = footer.child(
                pill(fill, ink)
                    .child(icon("rotate-ccw", 12.).text_color(ink))
                    .child(card.rework_cycle.to_string()),
            );
        }
        if let Some(branch) = &card.branch {
            footer = footer.child(
                div()
                    .min_w_0()
                    .flex()
                    .items_center()
                    .gap_1()
                    .text_size(px(11.))
                    .text_color(content(0.4))
                    .child(icon("git-branch", 12.))
                    .child(
                        div()
                            .truncate()
                            .font_family("monospace")
                            .child(short_branch(branch).to_owned()),
                    ),
            );
        }

        let draggable =
            !card.archived && self.stage_pending.is_none() && !self.card_moves(card).is_empty();
        let lifted = self.dragging.as_deref() == Some(card.id.as_str()) && cx.has_active_drag();
        let drag = CardDrag {
            card_id: card.id.clone(),
            number: card.number,
            title: card.title.clone(),
        };
        let weak = cx.weak_entity();

        div()
            .id(SharedString::from(selector.clone()))
            .debug_selector(move || selector.clone())
            .role(Role::Button)
            .aria_label(label)
            .aria_selected(selected)
            .relative()
            .w_full()
            .flex_shrink_0()
            .flex()
            .flex_col()
            .gap_2()
            .overflow_hidden()
            .rounded(px(CARD_RADIUS))
            .border_1()
            .py(px(CARD_PAD_Y))
            .pl(px(CARD_PAD_LEFT))
            .pr(px(CARD_PAD_RIGHT))
            .cursor_pointer()
            .map(|card| {
                if selected {
                    card.border_color(accent_color()).bg(content(0.075))
                } else {
                    card.border_color(content(0.08))
                        .bg(content(0.045))
                        .hover(|s| s.border_color(content(0.2)).bg(content(0.065)))
                }
            })
            .when_some(state, |card, (kind, _)| {
                card.child(
                    div()
                        .absolute()
                        .top(px(12.))
                        .bottom(px(12.))
                        .left(px(5.))
                        .w(px(2.))
                        .rounded_full()
                        .bg(stripe(kind)),
                )
            })
            .child(
                div()
                    .flex()
                    .items_center()
                    .gap_1p5()
                    .text_size(px(11.))
                    .text_color(content(0.45))
                    .child(
                        div()
                            .text_color(content(0.55))
                            .child(format!("#{}", card.number)),
                    )
                    .child(div().text_color(content(0.2)).child("·"))
                    .child(
                        div()
                            .min_w_0()
                            .truncate()
                            .child(project_name(&card.project_cwd).to_owned()),
                    ),
            )
            .child(
                div()
                    .text_size(px(13.))
                    .font_weight(FontWeight::MEDIUM)
                    .line_clamp(2)
                    .child(card.title.clone()),
            )
            .child(footer)
            .when_some(
                card.last_error.clone().filter(|_| card.run_state == FAILED),
                |card, error| {
                    card.child(
                        div()
                            .text_size(px(11.))
                            .text_color(content(0.55))
                            .line_clamp(2)
                            .child(error),
                    )
                },
            )
            .when(lifted, |card| {
                card.opacity(SOURCE_FADE)
                    .border_color(accent_color().opacity(0.4))
            })
            .when(draggable, |card| {
                card.on_drag(drag, move |drag, _, _, cx| {
                    let card_id = drag.card_id.clone();
                    let _ = weak.update(cx, |board, cx| board.begin_drag(card_id, cx));
                    cx.new(|_| drag.clone())
                })
            })
            .on_mouse_down(
                gpui::MouseButton::Left,
                cx.listener(|this, _, window, cx| window.focus(&this.focus, cx)),
            )
            .on_click(cx.listener(move |this, _, window, cx| {
                window.focus(&this.focus, cx);
                this.open_detail(id.clone(), cx);
            }))
            .into_any_element()
    }
}
