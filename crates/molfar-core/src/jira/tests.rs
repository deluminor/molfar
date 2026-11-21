use std::sync::{Arc, Mutex};

use serde_json::{json, Value};

use super::{
    append, groups, keep_rows_on_invalid, parent_jql, show_error, store_media, validate_jql,
    CachedList, Filter, GroupBy, ListModel, Row, ROW_CAP,
};
use crate::atlassian::{Client, Credentials, Error, Exchange, Transport};

struct Script {
    calls: Mutex<Vec<(String, String)>>,
    response: Value,
}

impl Transport for Script {
    fn exchange(
        &self,
        method: &str,
        url: &str,
        _authorization: &str,
        _body: Option<&str>,
    ) -> Result<Exchange, Error> {
        let path = url
            .split("https://team.atlassian.net")
            .nth(1)
            .unwrap_or(url);
        self.calls
            .lock()
            .expect("script")
            .push((method.into(), path.into()));
        Ok(Exchange {
            status: 200,
            retry_after: None,
            body: self.response.to_string().into_bytes(),
        })
    }
}

fn scripted(payload: Value) -> (Client, Arc<Script>) {
    let script = Arc::new(Script {
        calls: Mutex::new(Vec::new()),
        response: payload,
    });
    let credentials = Credentials::new("team", "user@example.com", "super-secret-token").unwrap();
    (Client::with_transport(&credentials, script.clone()), script)
}

fn row(key: &str, epic: &str, status: &str) -> Row {
    Row {
        key: key.into(),
        status: status.into(),
        epic_key: epic.into(),
        epic_summary: if epic.is_empty() {
            String::new()
        } else {
            "Epic".into()
        },
        ..Row::default()
    }
}

#[test]
fn filters_use_the_documented_jql() {
    assert_eq!(Filter::AssignedToMe.jql(), "assignee = currentUser()");
    assert_eq!(Filter::ReportedByMe.jql(), "reporter = currentUser()");
    assert_eq!(Filter::Watched.jql(), "watcher = currentUser()");
    assert_eq!(Filter::CurrentSprint.jql(), "sprint in openSprints()");
    assert_eq!(
        Filter::Saved {
            name: "Mine".into(),
            jql: "project = TB".into()
        }
        .jql(),
        "project = TB"
    );
}

#[test]
fn parent_jql_rejects_odd_characters() {
    assert_eq!(parent_jql("TB-1").unwrap(), "parent = TB-1");
    assert!(parent_jql("TB-1 OR text ~ \"x\"").is_err());
    assert!(parent_jql("TB 1").is_err());
}

#[test]
fn invalid_jql_keeps_the_previous_rows_and_is_not_sent_when_too_long() {
    let mut model = ListModel {
        rows: vec![row("TB-1", "", "Open")],
        ..ListModel::default()
    };
    keep_rows_on_invalid(&mut model, "Expected operator".into());
    assert_eq!(model.rows.len(), 1);
    assert_eq!(model.error.as_deref(), Some("Expected operator"));

    let (client, script) = scripted(json!({"queries":[{"errors":["Expected operator"]}]}));
    let error = validate_jql(&client, "assignee =").unwrap_err();
    assert!(matches!(error, Error::Invalid(message) if message == "Expected operator"));
    assert!(script
        .calls
        .lock()
        .unwrap()
        .iter()
        .any(|(_, path)| path == "/rest/api/3/jql/parse"));

    let (client, script) = scripted(json!({}));
    assert!(validate_jql(&client, &"a".repeat(2001)).is_err());
    assert!(script.calls.lock().unwrap().is_empty());
}

#[test]
fn pages_stop_at_five_hundred_rows() {
    let mut model = ListModel::default();
    append(
        &mut model,
        vec![row("TB-1", "EP-1", "Open"); 450],
        Some("next".into()),
    );
    assert_eq!(model.next.as_deref(), Some("next"));
    append(
        &mut model,
        vec![row("TB-2", "", ""); 100],
        Some("more".into()),
    );
    assert_eq!(model.rows.len(), ROW_CAP);
    assert!(model.next.is_none());
    assert_eq!(model.more.as_deref(), Some("more"));
    assert!(model.capped);
}

#[test]
fn favourite_filters_keep_name_and_jql() {
    let (client, script) = scripted(json!([
        {"name": "Mine", "jql": "project = TB"},
        {"name": "", "jql": "project = NO"},
        {"name": "Long", "jql": "a".repeat(2001)}
    ]));
    let saved = super::favourites(&client).unwrap();
    assert_eq!(saved.len(), 1);
    assert_eq!(saved[0].jql(), "project = TB");
    let calls = script.calls.lock().unwrap();
    assert_eq!(calls[0].1, "/rest/api/3/filter/favourite");
}

#[test]
fn stale_cache_is_ignored_and_saved_pages_omit_the_token() {
    let app = tempfile::tempdir().unwrap();
    let cached = CachedList {
        fetched_ms: 1_000,
        rows: vec![row("TB-1", "", "Open")],
        adf: vec![("TB-1".into(), json!({"type":"doc","content":[]}))],
    };
    super::save_list(
        app.path(),
        "https://team.atlassian.net",
        "assignee = currentUser()",
        &cached,
    )
    .unwrap();
    assert!(super::load_list(
        app.path(),
        "https://Team.atlassian.net",
        "assignee = currentUser()",
        1_000 + 5 * 60 * 1000
    )
    .unwrap()
    .is_none());
    let fresh = super::load_list(
        app.path(),
        "https://team.atlassian.net",
        "assignee = currentUser()",
        1_000 + 1_000,
    )
    .unwrap()
    .unwrap();
    assert_eq!(fresh.rows[0].key, "TB-1");
    let raw = std::fs::read_to_string(
        app.path()
            .join("jira-cache/team.atlassian.net/lists")
            .read_dir()
            .unwrap()
            .next()
            .unwrap()
            .unwrap()
            .path(),
    )
    .unwrap();
    assert!(!raw.contains("super-secret-token"));
    assert!(!raw.contains("Authorization"));
    assert!(!raw.contains("user@example.com"));
    assert!(!Error::Unauthorized
        .to_string()
        .contains("super-secret-token"));
}

#[test]
fn grouping_names_missing_epic_and_status_and_errors_are_visible() {
    let rows = vec![
        row("TB-1", "EP-1", "Open"),
        row("TB-2", "", "Open"),
        row("TB-3", "EP-1", ""),
    ];
    let epics = groups(&rows, GroupBy::Epic);
    assert_eq!(epics[0].title, "EP-1 Epic");
    assert_eq!(epics[1].title, "No epic");
    let statuses = groups(&rows, GroupBy::Status);
    assert!(statuses.iter().any(|group| group.title == "No status"));

    let mut model = ListModel::default();
    show_error(&mut model, &Error::Offline("down".into()));
    assert!(model.offline && model.rows.is_empty());
    show_error(&mut model, &Error::Unauthorized);
    assert!(model.unauthorized);
    show_error(&mut model, &Error::RateLimited);
    assert!(model.rate_limited);
}

#[test]
fn media_over_twenty_mebibytes_is_skipped() {
    let app = tempfile::tempdir().unwrap();
    let bytes = vec![1; 20 * 1024 * 1024 + 1];
    assert!(
        store_media(app.path(), "https://team.atlassian.net", "file", &bytes)
            .unwrap()
            .is_none()
    );
    assert!(
        store_media(app.path(), "https://team.atlassian.net", "file", b"png")
            .unwrap()
            .is_some()
    );
}
