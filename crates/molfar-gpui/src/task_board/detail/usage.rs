use super::super::{Board, controls, kanban::look};
use crate::{
    consumption::{
        format,
        table::{self, mono},
    },
    home::data::feeds::Load,
    runtime::locked,
    theme::*,
};
use gpui::{AnyElement, Context, Div, FontWeight, Role, SharedString, div, prelude::*, px};
use molfar_core::{
    consumption::{
        aggregate::{CardUsage, RunUsage},
        summary::Reporting,
    },
    task_board::constants::COLUMNS,
};

/// The selected card's usage; the last good value stays while a refresh runs.
#[derive(Default)]
pub(in crate::task_board) struct State {
    card_id: Option<String>,
    load: Option<Load<CardUsage>>,
    shown: Option<CardUsage>,
    generation: u64,
}

fn run_row(run: &RunUsage) -> gpui::Stateful<Div> {
    let name = COLUMNS
        .iter()
        .find(|(id, _)| *id == run.stage)
        .map_or(run.stage.as_str(), |(_, name)| *name);
    let stage = div()
        .flex()
        .items_baseline()
        .gap_1p5()
        .child(div().font_weight(FontWeight::MEDIUM).child(name.to_owned()))
        .when(run.attempt > 1, |d| {
            d.child(
                div()
                    .text_size(px(11.))
                    .text_color(content(0.45))
                    .child(format!("#{}", run.attempt)),
            )
        });
    table::row(
        SharedString::from(format!("board-usage-run-{}", run.run_id)),
        stage,
        controls::model_label(&run.harness, &run.model),
        &run.summary,
    )
}

fn totals(usage: &CardUsage) -> Div {
    let total = &usage.total;
    let estimate = format::estimate(total);
    let tokens = format!("{} tokens", format::tokens(total.total_tokens()));
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
                        .font_family(mono())
                        .text_size(px(18.))
                        .font_weight(FontWeight::MEDIUM)
                        .text_color(content(1.))
                        .child(estimate.clone().unwrap_or_else(|| tokens.clone())),
                )
                .when(estimate.is_some(), |d| {
                    d.child(
                        div()
                            .font_family(mono())
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
                .text_color(look::amber(1.))
                .child(note)
        }))
}

#[cfg(test)]
impl State {
    pub(super) fn set_for_test(&mut self, card_id: String, usage: CardUsage) {
        self.card_id = Some(card_id);
        self.load = Some(Load::Ready(usage.clone()));
        self.shown = Some(usage);
    }
}

impl Board {
    /// Loads the selected card's usage in the background; render reads only `State`.
    pub(in crate::task_board) fn refresh_card_usage(&mut self, cx: &mut Context<Self>) {
        let Some(card) = self.selected.clone() else {
            return;
        };
        let usage = &mut self.card_usage;
        if usage.card_id.as_ref() != Some(&card) {
            usage.shown = None;
        }
        usage.card_id = Some(card.clone());
        usage.generation += 1;
        usage.load = Some(Load::Loading);
        let generation = usage.generation;
        let store = self.store.clone();
        let work = cx.background_executor().spawn(async move {
            locked(&store)?.card_consumption(&card, molfar_core::time::now_ms())
        });

        cx.spawn(async move |this, cx| {
            let result = work.await;
            let _ = this.update(cx, |this, cx| {
                let usage = &mut this.card_usage;
                if usage.generation != generation {
                    return;
                }
                match result {
                    Ok(value) => {
                        usage.shown = Some(value.clone());
                        usage.load = Some(Load::Ready(value));
                    }
                    Err(error) => {
                        eprintln!("molfar: card usage failed: {error}");
                        usage.load = Some(Load::Failed(error));
                    }
                }
                cx.notify();
            });
        })
        .detach();
    }

    pub(super) fn usage_block(&self, card_id: &str) -> AnyElement {
        let state = &self.card_usage;
        let shown = state
            .shown
            .as_ref()
            .filter(|_| state.card_id.as_deref() == Some(card_id));
        let note = |text: String| {
            div()
                .text_size(px(12.))
                .text_color(content(0.5))
                .child(text)
                .into_any_element()
        };
        let Some(usage) = shown else {
            return match &state.load {
                Some(Load::Failed(error)) => div()
                    .id("board-usage-error")
                    .role(Role::Alert)
                    .text_size(px(12.))
                    .text_color(look::rose(1.))
                    .child(format!("Could not load usage. {error}"))
                    .into_any_element(),
                _ => note("Loading usage…".into()),
            };
        };
        if usage.total.reporting() == Reporting::Empty {
            return note("No usage recorded yet".into());
        }

        let mut rows = div()
            .flex()
            .flex_col()
            .mx(px(-8.))
            .child(table::heading("Stage", "Model"));
        for run in &usage.runs {
            rows = rows.child(run_row(run));
        }
        if usage.other.reporting() != Reporting::Empty {
            rows = rows.child(table::row(
                "board-usage-other".into(),
                div().text_color(content(0.6)).child("Other"),
                "Session activity outside stage runs",
                &usage.other,
            ));
        }

        div()
            .id("board-usage")
            .debug_selector(|| "board-usage".into())
            .flex()
            .flex_col()
            .gap_3()
            .child(totals(usage))
            .child(rows)
            .child(
                div()
                    .text_size(px(10.5))
                    .text_color(content(0.35))
                    .child(format::footnote()),
            )
            .when(matches!(state.load, Some(Load::Failed(_))), |d| {
                d.child(
                    div()
                        .text_size(px(11.))
                        .text_color(look::rose(1.))
                        .child("Showing the last loaded usage; refresh failed."),
                )
            })
            .into_any_element()
    }
}
