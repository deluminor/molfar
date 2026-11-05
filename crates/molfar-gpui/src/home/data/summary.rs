//! Status, Sessions and Automations rows, ported from home-status.ts,
//! recent-sessions.ts and recent-automations.ts.
use molfar_core::{automations::Automation, store::Session};

const DAY_MS: u64 = 24 * 60 * 60 * 1000;
pub(crate) const RECENT_SESSIONS: usize = 10;
pub(crate) const RECENT_AUTOMATIONS: usize = 6;

#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
pub(crate) struct Status {
    pub recent_sessions: usize,
    pub enabled_automations: usize,
    pub next_due_at: Option<i64>,
}

pub(crate) fn status(sessions: &[Session], automations: &[Automation], now: u64) -> Status {
    let cutoff = now.saturating_sub(DAY_MS);
    Status {
        recent_sessions: sessions
            .iter()
            .filter(|session| !session.archived && session.updated_at >= cutoff)
            .count(),
        enabled_automations: automations
            .iter()
            .filter(|automation| automation.enabled)
            .count(),
        next_due_at: automations
            .iter()
            .filter(|automation| automation.enabled && automation.next_run_at > 0)
            .map(|automation| automation.next_run_at)
            .min(),
    }
}

pub(crate) fn recent_sessions(sessions: &[Session]) -> Vec<Session> {
    let mut recent: Vec<Session> = sessions
        .iter()
        .filter(|session| !session.archived && session.has_messages)
        .cloned()
        .collect();
    recent.sort_by(|a, b| b.updated_at.cmp(&a.updated_at).then(b.id.cmp(&a.id)));
    recent.truncate(RECENT_SESSIONS);
    recent
}

pub(crate) fn recent_automations(automations: &[Automation]) -> Vec<Automation> {
    let mut recent = automations.to_vec();
    recent.sort_by(|a, b| {
        b.enabled
            .cmp(&a.enabled)
            .then(b.created_at.cmp(&a.created_at))
            .then(a.id.cmp(&b.id))
    });
    recent.truncate(RECENT_AUTOMATIONS);
    recent
}

/// "in 5m", "in 3h", "in 2d" or "due now"; dashes when nothing is scheduled.
pub(crate) fn next_due(at: Option<i64>, now: i64) -> String {
    let Some(at) = at.filter(|at| *at > 0) else {
        return "—".into();
    };
    let minutes = (at - now) / 60_000;
    if at <= now {
        return "due now".into();
    }
    if minutes < 60 {
        return format!("in {}m", minutes.max(1));
    }
    let hours = minutes / 60;
    if hours < 48 {
        return format!("in {hours}h");
    }
    format!("in {}d", hours / 24)
}

pub(crate) fn project_name(cwd: &str) -> &str {
    cwd.trim_end_matches('/')
        .rsplit('/')
        .next()
        .filter(|name| !name.is_empty())
        .unwrap_or(cwd)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn session(id: i64, updated_at: u64, archived: bool) -> Session {
        Session {
            id,
            title: format!("s{id}"),
            provider: "codex".into(),
            cwd: "/work/molfar".into(),
            provider_id: None,
            has_messages: true,
            updated_at,
            archived,
            pinned: false,
            work_item: None,
        }
    }

    fn automation(id: &str, enabled: bool, next_run_at: i64, created_at: i64) -> Automation {
        serde_json::from_value(serde_json::json!({
            "id": id, "name": id, "prompt": "", "harness": "codex", "model": "",
            "cwd": "/work", "workspaceMode": "local", "reuseSession": false,
            "runtimeMode": "auto", "scheduleKind": "daily", "minute": 0, "time": "09:00",
            "dayOfWeek": 0, "missedRunGraceMinutes": 0, "enabled": enabled,
            "nextRunAt": next_run_at, "createdAt": created_at, "updatedAt": created_at
        }))
        .unwrap()
    }

    #[test]
    fn status_counts_last_day_and_soonest_enabled_run() {
        let now = 10 * DAY_MS;
        let sessions = [
            session(1, now - 1000, false),
            session(2, now - 2 * DAY_MS, false),
            session(3, now - 1000, true),
        ];
        let automations = [
            automation("a", true, 900, 1),
            automation("b", true, 500, 2),
            automation("c", false, 100, 3),
            automation("d", true, 0, 4),
        ];

        assert_eq!(
            status(&sessions, &automations, now),
            Status {
                recent_sessions: 1,
                enabled_automations: 3,
                next_due_at: Some(500),
            }
        );
    }

    #[test]
    fn recent_lists_are_newest_first_and_capped() {
        let sessions: Vec<_> = (0..14)
            .map(|id| session(id, id as u64 * 10, id == 13))
            .collect();
        let recent = recent_sessions(&sessions);
        assert_eq!(recent.len(), RECENT_SESSIONS);
        assert_eq!(recent[0].id, 12);

        let automations = [
            automation("old", true, 0, 1),
            automation("off", false, 0, 9),
            automation("new", true, 0, 5),
        ];
        let ids: Vec<_> = recent_automations(&automations)
            .into_iter()
            .map(|a| a.id)
            .collect();
        assert_eq!(ids, ["new", "old", "off"]);
    }

    #[test]
    fn next_due_reads_like_the_desktop() {
        let now = 1_000_000;
        assert_eq!(next_due(None, now), "—");
        assert_eq!(next_due(Some(now - 1), now), "due now");
        assert_eq!(next_due(Some(now + 30_000), now), "in 1m");
        assert_eq!(next_due(Some(now + 5 * 3_600_000), now), "in 5h");
        assert_eq!(next_due(Some(now + 72 * 3_600_000), now), "in 3d");
        assert_eq!(project_name("/work/molfar/"), "molfar");
    }
}
