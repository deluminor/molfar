use super::format;
use crate::theme::*;
use gpui::{Div, div, prelude::*, px};
use molfar_core::consumption::summary::UsageSummary;

/// Title, totals, category breakdown, caveats and the price-table date, in one quiet stack.
pub(crate) fn summary_card(title: &str, summary: &UsageSummary) -> Div {
    let breakdown = format::breakdown(summary);
    let estimated = format::estimate(summary).is_some();

    div()
        .flex()
        .flex_col()
        .gap(px(2.))
        .text_size(px(12.))
        .line_height(px(16.))
        .text_color(content(1.))
        .child(title.to_owned())
        .child(
            div()
                .text_color(content(0.8))
                .child(format::headline(summary)),
        )
        .when(!breakdown.is_empty(), |d| {
            d.child(
                div()
                    .text_size(px(11.))
                    .text_color(content(0.5))
                    .child(breakdown),
            )
        })
        .children(format::caveats(summary).into_iter().map(|note| {
            div()
                .text_size(px(11.))
                .text_color(content(0.5))
                .child(note)
        }))
        .when(estimated, |d| {
            d.child(
                div()
                    .mt(px(4.))
                    .text_size(px(10.5))
                    .text_color(content(0.35))
                    .child(format::footnote()),
            )
        })
}
