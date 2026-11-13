use super::{summary::UsageSummary, types::UsageRecord};
use crate::task_board::types::StageRun;
use chrono::{NaiveDate, TimeZone};
use std::collections::{BTreeMap, HashMap, HashSet};

/// One stage attempt and the session records that fall inside its run window.
#[derive(Clone, Debug, PartialEq)]
pub struct RunUsage {
    pub run_id: String,
    pub stage: String,
    pub attempt: i64,
    pub model: String,
    pub status: String,
    pub summary: UsageSummary,
}

#[derive(Clone, Debug, Default, PartialEq)]
pub struct CardUsage {
    /// Every session of the card counted once, including records outside any run window.
    pub total: UsageSummary,
    pub runs: Vec<RunUsage>,
    /// Records of the card's sessions that no run window owns, such as owner follow-ups.
    pub other: UsageSummary,
}

#[derive(Clone, Copy, Debug, PartialEq)]
pub struct DayUsage {
    pub date: NaiveDate,
    pub summary: UsageSummary,
}

pub type RecordsBySession = HashMap<String, Vec<UsageRecord>>;

/// Turn start places a record in a run; its report time is the fallback.
fn record_time(record: &UsageRecord) -> Option<u64> {
    record.started_at_ms.or(record.reported_at_ms)
}

fn owns(run: &StageRun, at: u64, now: u64) -> bool {
    let start = u64::try_from(run.started_at).unwrap_or(0);
    let end = run
        .completed_at
        .and_then(|end| u64::try_from(end).ok())
        .unwrap_or(now);

    (start..=end).contains(&at)
}

/// Grill and Build runs can share one session; each session still contributes once.
pub fn card_usage(
    runs: &[StageRun],
    records: &RecordsBySession,
    now: u64,
) -> Result<CardUsage, String> {
    let mut usage = CardUsage {
        runs: runs
            .iter()
            .map(|run| RunUsage {
                run_id: run.id.clone(),
                stage: run.stage.clone(),
                attempt: run.attempt,
                model: run.model.clone(),
                status: run.status.clone(),
                summary: UsageSummary::default(),
            })
            .collect(),
        ..Default::default()
    };
    let mut counted = HashSet::new();
    for session in runs.iter().filter_map(|run| run.session_id.as_deref()) {
        if !counted.insert(session) {
            continue;
        }
        for record in records.get(session).into_iter().flatten() {
            usage.total.add(record)?;
            let owner = record_time(record).and_then(|at| {
                runs.iter().position(|run| {
                    run.session_id.as_deref() == Some(session) && owns(run, at, now)
                })
            });
            match owner {
                Some(index) => usage.runs[index].summary.add(record)?,
                None => usage.other.add(record)?,
            }
        }
    }

    Ok(usage)
}

/// Local calendar days, newest first; undated records belong only to totals.
pub fn daily<'a, Tz: TimeZone>(
    records: impl IntoIterator<Item = &'a UsageRecord>,
    zone: &Tz,
) -> Result<Vec<DayUsage>, String> {
    let mut days = BTreeMap::<NaiveDate, UsageSummary>::new();
    for record in records {
        let Some(at) = record.reported_at_ms.and_then(|at| i64::try_from(at).ok()) else {
            continue;
        };
        let Some(date) = zone
            .timestamp_millis_opt(at)
            .single()
            .map(|time| time.date_naive())
        else {
            continue;
        };
        days.entry(date).or_default().add(record)?;
    }

    Ok(days
        .into_iter()
        .rev()
        .map(|(date, summary)| DayUsage { date, summary })
        .collect())
}

/// Highest estimated cost first, then most tokens; stable for equal rows.
pub fn rank<T>(rows: &mut [T], summary: impl Fn(&T) -> &UsageSummary) {
    rows.sort_by(|a, b| {
        let (a, b) = (summary(a), summary(b));
        b.cost
            .cmp(&a.cost)
            .then(b.total_tokens().cmp(&a.total_tokens()))
    });
}
