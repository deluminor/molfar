use super::Board;
use crate::theme::*;
use gpui::{AnyElement, Context, FontWeight, Role, SharedString, div, prelude::*, px};
use molfar_core::task_board::{constants::COLUMNS, types::Card};

impl Board {
    fn card(&self, card: &Card, cx: &mut Context<Self>) -> AnyElement {
        let id = card.id.clone();
        let selector = format!("board-card-{id}");
        let selected = self.selected.as_ref() == Some(&id);
        div()
            .id(SharedString::from(selector.clone()))
            .debug_selector(move || selector.clone())
            .role(Role::Button)
            .aria_label(format!("#{} {}", card.number, card.title))
            .aria_selected(selected)
            .cursor_pointer()
            .p_2()
            .mb_1()
            .rounded_md()
            .border_1()
            .border_color(content(0.08))
            .when(selected, |d| d.bg(content(0.1)))
            .hover(|s| s.bg(content(0.08)))
            .child(
                div()
                    .text_size(px(13.))
                    .font_weight(FontWeight::SEMIBOLD)
                    .child(format!("#{} {}", card.number, card.title)),
            )
            .child(
                div()
                    .mt_1()
                    .text_size(px(11.))
                    .text_color(content(0.6))
                    .child(card.project_cwd.clone()),
            )
            .child(
                div()
                    .text_size(px(11.))
                    .child(super::stage::delivery::status_text(card)),
            )
            .when_some(card.last_error.clone(), |d, error| {
                d.child(div().mt_1().text_size(px(11.)).child(error))
            })
            .on_click(cx.listener(move |this, _, window, cx| {
                window.focus(&this.focus, cx);
                this.select(id.clone(), cx);
            }))
            .into_any_element()
    }

    pub(super) fn list(&self, cx: &mut Context<Self>) -> AnyElement {
        let mut list = div()
            .id("board-list")
            .debug_selector(|| "board-list".into())
            .role(Role::ListBox)
            .aria_label("Task Board cards")
            .w(px(320.))
            .max_w_full()
            .h_full()
            .flex_shrink_0()
            .overflow_y_scroll()
            .track_scroll(&self.scroll)
            .border_r_1()
            .border_color(content(0.08))
            .p_2();
        if let Some(snapshot) = &self.snapshot {
            for (column, label) in COLUMNS {
                let cards: Vec<_> = snapshot
                    .cards
                    .iter()
                    .filter(|card| card.column_id == column)
                    .collect();
                let selector = format!("board-column-{column}");
                list = list.child(
                    div()
                        .id(SharedString::from(selector.clone()))
                        .debug_selector(move || selector.clone())
                        .py_2()
                        .text_size(px(12.))
                        .font_weight(FontWeight::SEMIBOLD)
                        .child(format!("{label} · {}", cards.len())),
                );
                for card in cards {
                    list = list.child(self.card(card, cx));
                }
            }
            let other: Vec<_> = snapshot
                .cards
                .iter()
                .filter(|card| !COLUMNS.iter().any(|(id, _)| *id == card.column_id))
                .collect();
            if !other.is_empty() {
                list = list.child(div().py_2().child("Other columns"));
                for card in other {
                    list = list.child(self.card(card, cx));
                }
            }
            if snapshot.cards.is_empty() {
                list = list.child(
                    div()
                        .id("board-empty")
                        .debug_selector(|| "board-empty".into())
                        .py_2()
                        .text_size(px(12.))
                        .child("No cards match these filters."),
                );
            }
        }
        list.into_any_element()
    }
}
