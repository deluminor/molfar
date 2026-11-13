use super::super::super::{Event, Home};
use crate::{
    consumption::{format, table},
    modal::{self, sheet},
    task_board::controls,
    theme::*,
};
use gpui::{AnyElement, Context, Div, FontWeight, Role, SharedString, Window, div, prelude::*, px};
use molfar_core::{consumption::summary::Reporting, store::consumption::ProjectUsage};

const WIDTH: f32 = 680.;
const DAYS_SHOWN: usize = 30;

fn runs_label(runs: usize) -> String {
    format!("{runs} {}", if runs == 1 { "run" } else { "runs" })
}

fn section(title: &'static str) -> Div {
    div()
        .mt_5()
        .mb_2()
        .text_size(px(11.))
        .font_weight(FontWeight::MEDIUM)
        .text_color(content(0.5))
        .child(title)
}

fn empty(text: &'static str) -> Div {
    div()
        .px_2()
        .text_size(px(12.))
        .text_color(content(0.45))
        .child(text)
}

fn overview(usage: &ProjectUsage) -> Div {
    let total = &usage.total;
    let tokens = format!("{} tokens", format::tokens(total.total_tokens()));
    let estimate = format::estimate(total);
    div()
        .flex()
        .flex_col()
        .gap_1()
        .child(
            div()
                .flex()
                .items_baseline()
                .gap_2()
                .child(
                    div()
                        .font_family(table::mono())
                        .text_size(px(22.))
                        .font_weight(FontWeight::MEDIUM)
                        .child(estimate.clone().unwrap_or_else(|| tokens.clone())),
                )
                .when(estimate.is_some(), |d| {
                    d.child(
                        div()
                            .font_family(table::mono())
                            .text_size(px(12.))
                            .text_color(content(0.55))
                            .child(tokens),
                    )
                }),
        )
        .child(
            div()
                .text_size(px(11.))
                .text_color(content(0.5))
                .child(format::breakdown(total)),
        )
        .children(format::caveats(total).into_iter().map(|note| {
            div()
                .text_size(px(11.))
                .text_color(content(0.55))
                .child(note)
        }))
}

impl Home {
    pub(in crate::home) fn consumption_sheet(
        &self,
        window: &Window,
        cx: &mut Context<Self>,
    ) -> Option<AnyElement> {
        let feed = &self.feeds.consumption;
        if !feed.sheet_open {
            return None;
        }
        let scope = if feed.all {
            "All projects"
        } else {
            "This project"
        };
        let mut body = sheet::body("home-consumption-sheet-scroll");

        match &feed.shown {
            None => {
                let text = match &feed.load {
                    Some(crate::home::data::feeds::Load::Failed(error)) => {
                        format!("Could not load usage. {error}")
                    }
                    _ => "Loading usage…".into(),
                };
                body = body.child(
                    div()
                        .text_size(px(12.))
                        .text_color(content(0.55))
                        .child(text),
                );
            }
            Some(usage) if usage.total.reporting() == Reporting::Empty => {
                body = body.child(empty("No usage recorded yet."));
            }
            Some(usage) => body = self.sheet_tables(body, usage, cx),
        }

        let card = sheet::sheet(WIDTH)
            .bg(floating_fill())
            .max_h((window.viewport_size().height - px(40.)).max(px(200.)))
            .id("home-consumption-sheet")
            .debug_selector(|| "home-consumption-sheet".into())
            .role(Role::Dialog)
            .aria_label("Consumption")
            .child(
                sheet::header(
                    "Consumption",
                    Some(format!("{scope} · {}", format::footnote()).into()),
                )
                .child(
                    sheet::close_button("home-consumption-sheet-close").on_click(
                        cx.listener(|this, _, _, cx| this.set_consumption_sheet(false, cx)),
                    ),
                ),
            )
            .child(body);

        let weak = cx.weak_entity();
        Some(
            modal::window_overlay(
                window,
                modal::overlay("home-consumption", card, move |_, cx| {
                    let _ = weak.update(cx, |this, cx| this.set_consumption_sheet(false, cx));
                }),
            )
            .into_any_element(),
        )
    }

    fn sheet_tables(
        &self,
        body: gpui::Stateful<Div>,
        usage: &ProjectUsage,
        cx: &mut Context<Self>,
    ) -> gpui::Stateful<Div> {
        let mut days = div()
            .flex()
            .flex_col()
            .mx(px(-8.))
            .child(table::heading("Day", "Runs"));
        for day in usage.days.iter().take(DAYS_SHOWN) {
            days = days.child(table::row(
                SharedString::from(format!("home-consumption-sheet-day-{}", day.date)),
                day.date.format("%a %-d %b").to_string(),
                runs_label(day.summary.reported_runs + day.summary.unreported_runs),
                &day.summary,
            ));
        }

        let mut sessions = div()
            .flex()
            .flex_col()
            .mx(px(-8.))
            .child(table::heading("Project", "Session"));
        for row in &usage.sessions {
            let id = row.session;
            let title = if row.title.is_empty() {
                "Untitled".to_owned()
            } else {
                row.title.clone()
            };
            sessions = sessions.child(
                table::row(
                    SharedString::from(format!("home-consumption-sheet-session-{id}")),
                    crate::home::data::summary::project_name(&row.cwd).to_owned(),
                    div()
                        .flex()
                        .items_center()
                        .gap_1p5()
                        .child(provider_glyph(&row.provider, 12.))
                        .child(
                            div()
                                .min_w_0()
                                .truncate()
                                .text_color(content(0.85))
                                .child(title.clone()),
                        ),
                    &row.summary,
                )
                .cursor_pointer()
                .tooltip(move |_, cx| controls::hint(title.clone(), cx))
                .on_click(cx.listener(move |this, _, _, cx| {
                    this.set_consumption_sheet(false, cx);
                    cx.emit(Event::OpenSession(id));
                })),
            );
        }

        let mut cards = div()
            .flex()
            .flex_col()
            .mx(px(-8.))
            .child(table::heading("Card", "Title"));
        for row in &usage.cards {
            let card = row.card_id.clone();
            cards = cards.child(
                table::row(
                    SharedString::from(format!("home-consumption-sheet-card-{}", row.card_id)),
                    format!("#{}", row.number),
                    row.title.clone(),
                    &row.summary,
                )
                .cursor_pointer()
                .on_click(cx.listener(move |this, _, _, cx| {
                    this.set_consumption_sheet(false, cx);
                    cx.emit(Event::OpenCard(card.clone()));
                })),
            );
        }

        body.child(overview(usage))
            .when(!usage.issues.is_empty(), |d| {
                d.child(
                    div()
                        .mt_2()
                        .text_size(px(11.))
                        .text_color(content(0.55))
                        .child(format!(
                            "History of {} sessions could not be read; their saved usage is shown.",
                            usage.issues.len()
                        )),
                )
            })
            .child(section("Daily"))
            .child(days)
            .child(section("Sessions"))
            .child(sessions)
            .child(section("Board cards"))
            .when(usage.cards.is_empty(), |d| {
                d.child(empty("No card usage yet."))
            })
            .when(!usage.cards.is_empty(), |d| d.child(cards))
    }
}
