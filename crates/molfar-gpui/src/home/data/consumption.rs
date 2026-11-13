//! Home's consumption feed: project or global usage, loaded off the render path.
use super::{super::Home, feeds::Load};
use crate::runtime::locked;
use chrono::{Days, Local, NaiveDate};
use gpui::Context;
use molfar_core::{
    consumption::{aggregate::DayUsage, summary::UsageSummary},
    store::consumption::ProjectUsage,
};

pub(crate) const WEEK: usize = 7;

#[derive(Default)]
pub(crate) struct Consumption {
    /// All projects instead of the open one.
    pub all: bool,
    pub load: Option<Load<ProjectUsage>>,
    /// The last good result stays on screen while a refresh runs or fails.
    pub shown: Option<ProjectUsage>,
    pub sheet_open: bool,
    generation: u64,
}

/// Today, the last seven local days, and one bar per day, oldest first.
#[derive(Clone, Debug, Default, PartialEq)]
pub(crate) struct Recent {
    pub today: UsageSummary,
    pub week: UsageSummary,
    pub bars: Vec<(NaiveDate, UsageSummary)>,
}

pub(crate) fn recent(days: &[DayUsage], today: NaiveDate) -> Result<Recent, String> {
    let mut recent = Recent::default();
    for back in (0..WEEK as u64).rev() {
        let Some(date) = today.checked_sub_days(Days::new(back)) else {
            continue;
        };
        let summary = days
            .iter()
            .find(|day| day.date == date)
            .map(|day| day.summary)
            .unwrap_or_default();
        recent.week.merge(&summary)?;
        if back == 0 {
            recent.today = summary;
        }
        recent.bars.push((date, summary));
    }

    Ok(recent)
}

/// Cost when every bar has one, tokens otherwise, so bars never mix units.
pub(crate) fn bar_heights(bars: &[(NaiveDate, UsageSummary)]) -> Vec<f32> {
    let by_cost = bars.iter().any(|(_, day)| day.priced_runs > 0);
    let value = |day: &UsageSummary| {
        if by_cost {
            day.cost.usd() as f32
        } else {
            day.total_tokens() as f32
        }
    };
    let peak = bars.iter().map(|(_, day)| value(day)).fold(0., f32::max);

    bars.iter()
        .map(|(_, day)| if peak > 0. { value(day) / peak } else { 0. })
        .collect()
}

impl Home {
    pub(in crate::home) fn refresh_consumption(&mut self, cx: &mut Context<Self>) {
        let feed = &mut self.feeds.consumption;
        feed.generation += 1;
        feed.load = Some(Load::Loading);
        let generation = feed.generation;
        let store = self.sources.store.clone();
        let project =
            (!feed.all && !self.sources.project.is_empty()).then(|| self.sources.project.clone());
        let work = cx.background_executor().spawn(async move {
            let store = store.ok_or("Usage is unavailable")?;
            locked(&store)?.project_consumption(project.as_deref(), &Local)
        });

        cx.spawn(async move |this, cx| {
            let result = work.await;
            let _ = this.update(cx, |this, cx| {
                let feed = &mut this.feeds.consumption;
                if feed.generation != generation {
                    return;
                }
                match result {
                    Ok(usage) => {
                        feed.shown = Some(usage.clone());
                        feed.load = Some(Load::Ready(usage));
                    }
                    Err(error) => {
                        eprintln!("molfar: home could not load usage: {error}");
                        feed.load = Some(Load::Failed(error));
                    }
                }
                cx.notify();
            });
        })
        .detach();
    }

    pub(in crate::home) fn set_consumption_scope(&mut self, all: bool, cx: &mut Context<Self>) {
        if self.feeds.consumption.all == all {
            return;
        }
        self.feeds.consumption.all = all;
        self.feeds.consumption.shown = None;
        self.refresh_consumption(cx);
        cx.notify();
    }

    pub(in crate::home) fn set_consumption_sheet(&mut self, open: bool, cx: &mut Context<Self>) {
        self.feeds.consumption.sheet_open = open;
        if open {
            self.refresh_consumption(cx);
        }
        cx.notify();
    }
}

#[cfg(test)]
#[path = "consumption_tests.rs"]
mod tests;
