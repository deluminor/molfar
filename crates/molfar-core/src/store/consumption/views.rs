use crate::{
    consumption::{
        aggregate::{self, CardUsage, DayUsage, RecordsBySession},
        summary::UsageSummary,
    },
    files::path_key,
    store::{Session, Store},
};
use chrono::TimeZone;

#[derive(Clone, Debug, PartialEq)]
pub struct SessionRow {
    pub session: i64,
    pub title: String,
    pub provider: String,
    pub cwd: String,
    pub summary: UsageSummary,
}

#[derive(Clone, Debug, PartialEq)]
pub struct CardRow {
    pub card_id: String,
    pub number: i64,
    pub title: String,
    pub summary: UsageSummary,
}

/// Alternative projections of one scope: sessions, cards and days are not additive.
#[derive(Clone, Debug, Default, PartialEq)]
pub struct ProjectUsage {
    pub total: UsageSummary,
    pub sessions: Vec<SessionRow>,
    pub cards: Vec<CardRow>,
    pub days: Vec<DayUsage>,
    /// Sessions whose history could not be reconciled; their saved usage is still shown.
    pub issues: Vec<String>,
}

fn in_scope(cwd: &str, project: Option<&str>) -> bool {
    project.is_none_or(|project| path_key(cwd) == path_key(project))
}

impl Store {
    /// Reconciled summary of one session; for background work only.
    pub fn session_usage(&self, session: i64) -> Result<UsageSummary, String> {
        let sessions = self.sessions()?;
        let scoped: Vec<_> = sessions.iter().filter(|row| row.id == session).collect();
        self.reconcile_consumption(&scoped);

        UsageSummary::of(&self.session_consumption(session)?)
    }

    /// Card total, per-attempt breakdown and unowned session usage; for background work only.
    pub fn card_consumption(&self, card: &str, now: u64) -> Result<CardUsage, String> {
        let runs = self.board_snapshot(None, false, Some(card))?.runs;
        let ids: Vec<String> = runs
            .iter()
            .filter_map(|run| run.session_id.clone())
            .collect();
        let sessions = self.sessions()?;
        let scoped: Vec<_> = sessions
            .iter()
            .filter(|session| {
                self.persisted_session_id(session.id)
                    .is_ok_and(|id| ids.contains(&id))
            })
            .collect();
        self.reconcile_consumption(&scoped);

        aggregate::card_usage(&runs, &self.consumption_for(&ids)?, now)
    }

    /// Project-scoped (or global) session and card tables with local daily totals.
    pub fn project_consumption<Tz: TimeZone>(
        &self,
        project: Option<&str>,
        zone: &Tz,
    ) -> Result<ProjectUsage, String> {
        let sessions = self.sessions()?;
        let scoped: Vec<&Session> = sessions
            .iter()
            .filter(|session| in_scope(&session.cwd, project))
            .collect();
        let issues = self.reconcile_consumption(&scoped);
        let keyed: Vec<(String, &Session)> = scoped
            .iter()
            .filter_map(|session| Some((self.persisted_session_id(session.id).ok()?, *session)))
            .collect();
        let ids: Vec<String> = keyed.iter().map(|(id, _)| id.clone()).collect();
        let records = self.consumption_for(&ids)?;

        let mut usage = ProjectUsage {
            issues,
            ..Default::default()
        };
        for (id, session) in &keyed {
            let Some(rows) = records.get(id) else {
                continue;
            };
            let summary = UsageSummary::of(rows)?;
            usage.total.merge(&summary)?;
            usage.sessions.push(SessionRow {
                session: session.id,
                title: session.title.clone(),
                provider: session.provider.clone(),
                cwd: session.cwd.clone(),
                summary,
            });
        }
        usage.cards = self.card_rows(project, &records)?;
        usage.days = aggregate::daily(records.values().flatten(), zone)?;
        aggregate::rank(&mut usage.sessions, |row| &row.summary);
        aggregate::rank(&mut usage.cards, |row| &row.summary);

        Ok(usage)
    }

    fn card_rows(
        &self,
        project: Option<&str>,
        records: &RecordsBySession,
    ) -> Result<Vec<CardRow>, String> {
        let mut rows = Vec::new();
        for card in self.card_sessions()? {
            if !in_scope(&card.project, project) {
                continue;
            }
            let mut summary = UsageSummary::default();
            for session in &card.sessions {
                for record in records.get(session).into_iter().flatten() {
                    summary.add(record)?;
                }
            }
            if summary.reporting() == crate::consumption::summary::Reporting::Empty {
                continue;
            }
            rows.push(CardRow {
                card_id: card.card_id,
                number: card.number,
                title: card.title,
                summary,
            });
        }

        Ok(rows)
    }
}
