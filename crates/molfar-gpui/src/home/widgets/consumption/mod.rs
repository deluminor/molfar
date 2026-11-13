mod chart;
mod sheet;

use super::{
    super::{
        Event, Home, card,
        data::{consumption::recent, feeds::Load},
    },
    Body,
    parts::{self, mono},
};
use crate::theme::*;
use chart::{amount, bars, figure, range_selector};
use chrono::Local;
use gpui::{AnyElement, Context, SharedString, div, prelude::*, px};
use molfar_core::consumption::summary::{Reporting, UsageSummary};

const WIDE: f32 = 560.;
const TOP: usize = 10;

impl Home {
    pub(super) fn consumption_widget(&self, body: Body, cx: &mut Context<Self>) -> AnyElement {
        let feed = &self.feeds.consumption;
        let Some(usage) = &feed.shown else {
            return match &feed.load {
                Some(Load::Failed(error)) => card::note(format!("Usage unavailable · {error}")),
                _ => card::note("Loading…"),
            }
            .into_any_element();
        };
        if usage.total.reporting() == Reporting::Empty {
            let scope = if feed.all {
                "yet"
            } else {
                "in this project yet"
            };
            return card::note(format!("No usage recorded {scope}")).into_any_element();
        }
        let range = feed.range;
        let recent = match recent(&usage.days, Local::now().date_naive(), range) {
            Ok(recent) => recent,
            Err(error) => return card::note(error).into_any_element(),
        };

        let wide = body.w >= WIDE;
        let totals = div()
            .when(wide, |d| d.w(px(body.w * 0.34)))
            .when(!wide, |d| d.w_full())
            .flex_shrink_0()
            .flex()
            .flex_col()
            .gap_2()
            .child(
                div()
                    .flex()
                    .gap_3()
                    .child(figure("Today", &recent.today))
                    .child(figure(range.label(), &recent.total)),
            )
            .child(range_selector(range, cx))
            .child(bars(&recent, range, self.entrance, !cx.reduce_motion()));
        let sessions: Vec<_> = usage
            .sessions
            .iter()
            .filter(|row| reported(&row.summary))
            .take(TOP)
            .map(|row| {
                let id = row.session;
                self.top_row(
                    SharedString::from(format!("home-consumption-session-{id}")),
                    if row.title.is_empty() {
                        "Untitled".into()
                    } else {
                        row.title.clone()
                    },
                    &row.summary,
                    Event::OpenSession(id),
                    cx,
                )
            })
            .collect();
        let cards: Vec<_> = usage
            .cards
            .iter()
            .filter(|row| reported(&row.summary))
            .take(TOP)
            .map(|row| {
                self.top_row(
                    SharedString::from(format!("home-consumption-card-{}", row.card_id)),
                    format!("#{} {}", row.number, row.title),
                    &row.summary,
                    Event::OpenCard(row.card_id.clone()),
                    cx,
                )
            })
            .collect();

        let list = |label: &'static str, rows: Vec<AnyElement>| {
            let empty = rows.is_empty();
            div()
                .flex_1()
                .min_h_0()
                .min_w_0()
                .flex()
                .flex_col()
                .gap_0p5()
                .child(parts::label(label).mb_1().flex_shrink_0())
                .child(
                    div()
                        .id(SharedString::from(format!("home-consumption-list-{label}")))
                        .min_h_0()
                        .flex_1()
                        .overflow_y_scroll()
                        .flex()
                        .flex_col()
                        .gap_0p5()
                        .children(rows),
                )
                .when(empty, |d| d.child(card::note("None yet")))
        };
        div()
            .id("home-consumption")
            .debug_selector(|| "home-consumption".into())
            .size_full()
            .min_h_0()
            .overflow_y_scroll()
            .flex()
            .when(wide, |d| d.flex_row().gap_5())
            .when(!wide, |d| d.flex_col().gap_3())
            .child(totals)
            .child(list("Top sessions", sessions).when(!wide, |d| d.flex_none().h(px(310.))))
            .child(list("Top cards", cards).when(!wide, |d| d.flex_none().h(px(310.))))
            .into_any_element()
    }

    fn top_row(
        &self,
        id: SharedString,
        title: String,
        summary: &UsageSummary,
        event: Event,
        cx: &mut Context<Self>,
    ) -> AnyElement {
        let selector = id.to_string();
        parts::row(id)
            .debug_selector(move || selector.clone())
            .child(div().flex_1().min_w_0().truncate().child(title))
            .child(
                div()
                    .flex_shrink_0()
                    .font_family(mono())
                    .text_size(px(11.))
                    .text_color(content(0.6))
                    .child(amount(summary)),
            )
            .on_click(cx.listener(move |_, _, _, cx| cx.emit(event.clone())))
            .into_any_element()
    }

    pub(super) fn consumption_actions(&self, cx: &mut Context<Self>) -> AnyElement {
        let all = self.feeds.consumption.all;
        let scope = |id: &'static str, label: &'static str, active: bool, target: bool| {
            div()
                .id(id)
                .debug_selector(move || id.into())
                .cursor_pointer()
                .px_1()
                .rounded_sm()
                .text_color(if active { accent_color() } else { content(0.4) })
                .hover(|style| style.text_color(content(0.85)))
                .child(label)
                .on_click(cx.listener(move |this, _, _, cx| this.set_consumption_scope(target, cx)))
        };

        div()
            .flex()
            .items_center()
            .gap_1()
            .font_family(mono())
            .text_size(px(10.))
            .child(scope("home-consumption-project", "PROJECT", !all, false))
            .child(scope("home-consumption-all", "ALL", all, true))
            .child(
                div()
                    .id("home-consumption-details")
                    .debug_selector(|| "home-consumption-details".into())
                    .ml_1()
                    .flex()
                    .items_center()
                    .cursor_pointer()
                    .text_color(content(0.5))
                    .hover(|style| style.text_color(content(1.)))
                    .child("DETAILS")
                    .child(icon("chevron-right", 10.))
                    .on_click(cx.listener(|this, _, _, cx| this.set_consumption_sheet(true, cx))),
            )
            .into_any_element()
    }
}

/// Top lists rank what was actually reported; unreported-only rows live in the sheet.
fn reported(summary: &UsageSummary) -> bool {
    matches!(
        summary.reporting(),
        Reporting::Partial | Reporting::Complete
    )
}
