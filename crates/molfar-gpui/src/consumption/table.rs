use super::format;
use crate::{task_board::controls, theme::*};
use gpui::{Div, SharedString, Stateful, div, prelude::*, px};
use molfar_core::consumption::summary::{Reporting, UsageSummary};

const LEAD_COLUMN: f32 = 120.;
const COST_COLUMN: f32 = 64.;
const TOKENS_COLUMN: f32 = 88.;

pub(crate) fn mono() -> &'static str {
    crate::fonts::familiar()
}

fn cost_cell(summary: &UsageSummary) -> Div {
    let cost = match summary.reporting() {
        Reporting::Empty | Reporting::NotReported => None,
        _ => format::estimate(summary),
    };
    div()
        .w(px(COST_COLUMN))
        .flex_shrink_0()
        .text_right()
        .font_family(mono())
        .text_color(content(if cost.is_some() { 0.85 } else { 0.3 }))
        .child(cost.unwrap_or_else(|| "—".into()))
}

fn tokens_cell(summary: &UsageSummary) -> Div {
    let text = match summary.reporting() {
        Reporting::Empty => "—".to_owned(),
        Reporting::NotReported => "Not reported".to_owned(),
        _ => format::tokens(summary.total_tokens()),
    };
    div()
        .w(px(TOKENS_COLUMN))
        .flex_shrink_0()
        .text_right()
        .font_family(mono())
        .text_color(content(0.7))
        .child(text)
}

/// `lead · detail · tokens · ~cost`; caveats such as partial reports appear on hover.
pub(crate) fn row(
    id: SharedString,
    lead: impl IntoElement,
    detail: impl Into<SharedString>,
    summary: &UsageSummary,
) -> Stateful<Div> {
    let caveats = format::caveats(summary).join("\n");
    let selector = id.to_string();
    div()
        .id(id)
        .debug_selector(move || selector.clone())
        .flex()
        .items_center()
        .gap_3()
        .h(px(30.))
        .px_2()
        .rounded_md()
        .text_size(px(12.))
        .hover(|style| style.bg(content(0.035)))
        .when(!caveats.is_empty(), |row| {
            row.tooltip(move |_, cx| controls::hint(caveats.clone(), cx))
        })
        .child(
            div()
                .w(px(LEAD_COLUMN))
                .flex_shrink_0()
                .min_w_0()
                .truncate()
                .child(lead),
        )
        .child(
            div()
                .flex_1()
                .min_w_0()
                .truncate()
                .text_size(px(11.))
                .text_color(content(0.5))
                .child(detail.into()),
        )
        .child(tokens_cell(summary))
        .child(cost_cell(summary))
}

/// The column captions above a list of [`row`]s.
pub(crate) fn heading(lead: &'static str, detail: &'static str) -> Div {
    let caption = |text: &'static str| div().child(text);
    div()
        .flex()
        .items_center()
        .gap_3()
        .px_2()
        .pb_1()
        .text_size(px(10.5))
        .text_color(content(0.4))
        .child(caption(lead).w(px(LEAD_COLUMN)).flex_shrink_0())
        .child(caption(detail).flex_1().min_w_0())
        .child(
            caption("Tokens")
                .w(px(TOKENS_COLUMN))
                .flex_shrink_0()
                .text_right(),
        )
        .child(
            caption("Cost")
                .w(px(COST_COLUMN))
                .flex_shrink_0()
                .text_right(),
        )
}
