//! Provider usage for the Home widget, read from the accounts cache that the
//! usage chip already fills; Home never runs a probe of its own.
use crate::accounts::{Cached, Key};
use gpui::App;
use molfar_core::{provider::Kind, usage::Window};

pub(crate) const USAGE_KINDS: [Kind; 4] = [Kind::Claude, Kind::Codex, Kind::Devin, Kind::OpenCode];

#[derive(Clone, Debug, PartialEq)]
pub(crate) struct UsageRow {
    pub kind: Kind,
    pub used_percent: Option<f64>,
    pub window: Option<String>,
    pub reset: Option<String>,
    pub status: String,
    pub fetching: bool,
    pub windows: Vec<Window>,
}

/// One row per provider that has, or is fetching, usage; providers without
/// any subscription usage stay out instead of showing an empty bar.
pub(crate) fn row(kind: Kind, cached: &Cached, now: i64) -> Option<UsageRow> {
    if cached.error.as_ref().is_some_and(|error| error.unavailable) {
        return None;
    }
    if cached.snapshot.is_none() && cached.error.is_none() && !cached.fetching {
        return None;
    }

    let windows = cached
        .snapshot
        .as_ref()
        .map(|snapshot| snapshot.windows.clone())
        .unwrap_or_default();
    let primary = windows.first();
    let status = match (&cached.error, primary) {
        (Some(error), None) => error.message.clone(),
        (_, Some(window)) => window.label(),
        (None, None) if cached.fetching => "Loading".into(),
        (None, None) => "Ready".into(),
    };

    Some(UsageRow {
        kind,
        used_percent: primary.map(|window| window.used_percent.clamp(0., 100.)),
        window: primary.map(Window::label),
        reset: primary
            .and_then(|window| window.resets_at)
            .map(|at| molfar_core::usage::duration(at.saturating_sub(now))),
        status,
        fetching: cached.fetching && cached.snapshot.is_none(),
        windows,
    })
}

fn key(kind: Kind, project: &str, cx: &App) -> Option<Key> {
    let center = crate::accounts::get(cx)?;
    Some(Key::new(
        kind,
        center.read(cx).selected(kind, project),
        None,
    ))
}

pub(crate) fn rows(project: &str, now: i64, cx: &App) -> Vec<UsageRow> {
    let Some(center) = crate::accounts::get(cx) else {
        return Vec::new();
    };
    USAGE_KINDS
        .into_iter()
        .filter_map(|kind| {
            let key = key(kind, project, cx)?;
            row(kind, center.read(cx).usage.get(&key)?, now)
        })
        .collect()
}

/// Asks the shared cache for fresh usage; its own throttle keeps this cheap.
pub(crate) fn request(project: &str, cx: &mut App) {
    let Some(center) = crate::accounts::get(cx) else {
        return;
    };
    for kind in USAGE_KINDS {
        if let Some(key) = key(kind, project, cx) {
            center.update(cx, |center, cx| center.refresh(key, false, cx));
        }
    }
}

#[cfg(test)]
mod tests {
    use super::row;
    use crate::accounts::Cached;
    use molfar_core::{
        provider::Kind,
        usage::{FetchError, Snapshot, Window},
    };

    fn snapshot(used: f64) -> Snapshot {
        Snapshot {
            windows: vec![Window {
                used_percent: used,
                minutes: 300,
                resets_at: Some(3_600_000 + 1_000),
            }],
            ..Default::default()
        }
    }

    #[test]
    fn rows_show_percent_window_and_reset() {
        let cached = Cached {
            snapshot: Some(snapshot(140.)),
            ..Default::default()
        };

        let row = row(Kind::Claude, &cached, 1_000).unwrap();

        assert_eq!(row.used_percent, Some(100.));
        assert_eq!(row.window.as_deref(), Some("5h"));
        assert!(row.reset.is_some());
        assert!(!row.fetching);
    }

    #[test]
    fn unavailable_and_untouched_providers_are_hidden() {
        let unavailable = Cached {
            error: Some(FetchError {
                message: "Sign in".into(),
                unavailable: true,
            }),
            ..Default::default()
        };
        assert!(row(Kind::Codex, &unavailable, 0).is_none());
        assert!(row(Kind::Codex, &Cached::default(), 0).is_none());

        let loading = Cached {
            fetching: true,
            ..Default::default()
        };
        assert_eq!(row(Kind::Codex, &loading, 0).unwrap().status, "Loading");

        let failed = Cached {
            error: Some(FetchError {
                message: "Rate limited".into(),
                unavailable: false,
            }),
            ..Default::default()
        };
        let failed = row(Kind::Codex, &failed, 0).unwrap();
        assert_eq!(failed.status, "Rate limited");
        assert_eq!(failed.used_percent, None);
    }
}
