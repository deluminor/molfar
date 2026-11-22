use std::sync::{Arc, Mutex};

use serde_json::{json, Value};

use super::{
    append, chips, expand_mentions, groups, keep_rows_on_invalid, mention_jql, parent_jql,
    show_error, store_media, validate_jql, CachedList, Filter, GroupBy, ListModel, Row, ROW_CAP,
};
use crate::atlassian::{Client, Credentials, Error, Exchange, Transport};

struct Script {
    calls: Mutex<Vec<(String, String)>>,
    bodies: Mutex<Vec<String>>,
    response: Value,
}

impl Transport for Script {
    fn exchange(
        &self,
        method: &str,
        url: &str,
        _authorization: &str,
        body: Option<&str>,
    ) -> Result<Exchange, Error> {
        let path = url
            .split("https://team.atlassian.net")
            .nth(1)
            .unwrap_or(url);
        self.calls
            .lock()
            .expect("script")
            .push((method.into(), path.into()));
        self.bodies
            .lock()
            .expect("script")
            .push(body.unwrap_or("").to_string());
        Ok(Exchange {
            status: 200,
            retry_after: None,
            body: self.response.to_string().into_bytes(),
            location: None,
            content_length: None,
        })
    }
}

fn scripted(payload: Value) -> (Client, Arc<Script>) {
    let script = Arc::new(Script {
        calls: Mutex::new(Vec::new()),
        bodies: Mutex::new(Vec::new()),
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
fn links_cap_the_issue_epic_and_jql_text() {
    let issue = super::Issue {
        key: "TB-1".into(),
        summary: "Ship".into(),
        status: "Open".into(),
        description: "d".repeat(9000),
        comments: (0..40)
            .map(|index| super::issue::Comment {
                author: "Ada".into(),
                created: format!("2024-01-{:02}", index + 1),
                body: "c".repeat(400),
                ..super::issue::Comment::default()
            })
            .collect(),
        ..super::Issue::default()
    };
    let link = super::format_issue("https://Team.atlassian.net", "TB-1").unwrap();
    assert_eq!(link, "molfar://jira/team.atlassian.net/TB-1");
    let markdown = super::issue_markdown(&issue, true, &link);
    assert!(markdown.contains("truncated"));
    assert!(markdown.ends_with(&link));
    assert!(markdown.len() < 9000 + 8000 + link.len() + 64);
    let rows = vec![row("TB-1", "", "Open"); 41];
    let index = super::list_index("Assigned", &rows, &link);
    assert!(index.contains("truncated"));
    assert!(super::format_jql("team", &"a".repeat(2001)).is_err());
    assert!(super::format_issue("team", "bad key").is_err());
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
fn mention_search_matches_a_key_or_a_summary() {
    assert_eq!(
        mention_jql("TB-1").unwrap(),
        "key = TB-1 OR summary ~ \"TB-1\" ORDER BY updated DESC"
    );
    assert_eq!(
        mention_jql("ship").unwrap(),
        "summary ~ \"ship\" ORDER BY updated DESC"
    );
    assert!(mention_jql("  ").is_err());
}

#[test]
fn chips_parse_issue_project_and_jql_and_offline_blocks_expand() {
    let found = chips("see @jira/team.atlassian.net/TB-1 and @jira/team.atlassian.net/project/TB");
    assert!(matches!(found[0].target, super::Target::Issue { .. }));
    assert!(matches!(found[1].target, super::Target::Project { .. }));
    let jql = chips("@jira/team.atlassian.net/jql?q=project%20%3D%20TB");
    assert!(matches!(jql[0].target, super::Target::Jql { .. }));

    let (client, _) = scripted(json!({
        "key": "TB-1",
        "fields": {
            "summary": "Ship",
            "status": { "name": "Open" },
            "issuetype": { "name": "Task" }
        }
    }));
    let text = expand_mentions(&client, "look @jira/team.atlassian.net/TB-1").unwrap();
    assert!(text.contains("TB-1 Ship"));
    assert!(text.contains("molfar://jira/team.atlassian.net/TB-1"));
    assert!(!text.contains("@jira/"));

    struct Down;
    impl Transport for Down {
        fn exchange(&self, _: &str, _: &str, _: &str, _: Option<&str>) -> Result<Exchange, Error> {
            Err(Error::Offline("no route".into()))
        }
    }
    let credentials = Credentials::new("team", "user@example.com", "super-secret-token").unwrap();
    let client = Client::with_transport(&credentials, Arc::new(Down));
    let error = expand_mentions(&client, "@jira/team.atlassian.net/TB-1").unwrap_err();
    assert!(matches!(error, Error::Offline(_)));
}

#[test]
fn classic_epic_link_groups_with_the_parent_epic() {
    let row = super::query::row(
        &json!({
            "key": "TB-2",
            "fields": { "customfield_10014": "EP-1", "summary": "Child" }
        }),
        None,
        Some("customfield_10014"),
    );
    assert_eq!(row.epic_key, "EP-1");
    let grouped = groups(&[row], GroupBy::Epic);
    assert_eq!(grouped[0].title, "EP-1");
}

#[test]
fn search_asks_for_the_requested_page_and_fields() {
    let (client, script) = scripted(json!({"issues": []}));
    let fields = vec!["summary".to_string(), "status".to_string()];
    super::search_limited(
        &client,
        &Filter::Jql("project = TB".into()),
        None,
        None,
        None,
        80,
        Some(&fields),
    )
    .unwrap();
    let body = script.bodies.lock().unwrap();
    let payload: Value = serde_json::from_str(body[0].as_str()).unwrap();
    assert_eq!(payload["maxResults"], 80);
    assert_eq!(payload["fields"], json!(["summary", "status"]));
}

#[test]
fn label_only_edit_leaves_the_summary_unchanged() {
    let (client, script) = scripted(json!({}));
    super::issue::edit(&client, "TB-1", None, None, Some(&["ship".to_string()])).unwrap();
    let payload: Value = serde_json::from_str(&script.bodies.lock().unwrap()[0]).unwrap();
    assert!(payload["fields"].get("summary").is_none());
    assert!(payload["fields"].get("description").is_none());
    assert_eq!(payload["fields"]["labels"], json!(["ship"]));
}

#[test]
fn a_long_description_returns_the_next_character_offset() {
    let text = "x".repeat(6001);
    let (client, _) = scripted(json!({
        "key": "TB-1",
        "fields": {
            "description": {
                "type": "doc",
                "version": 1,
                "content": [{
                    "type": "paragraph",
                    "content": [{"type": "text", "text": text}]
                }]
            }
        }
    }));
    let fields = vec!["description".to_string()];
    let value = super::tools::get(&client, "TB-1", Some(&fields), 0).unwrap();
    assert_eq!(value["description"].as_str().unwrap().len(), 6000);
    assert_eq!(value["nextCharOffset"], 6000);
}

#[test]
fn worklog_more_is_the_unreturned_count() {
    let issue = super::issue::parse(
        &json!({
            "key": "TB-1",
            "fields": {
                "worklog": {
                    "total": 3,
                    "worklogs": [{"id": "1"}]
                }
            }
        }),
        None,
    );
    assert_eq!(issue.work.more, 2);
}

#[test]
fn attachment_redirect_drops_authorization_and_skips_a_large_length() {
    struct Redirect {
        calls: Mutex<Vec<(String, String)>>,
    }
    impl Transport for Redirect {
        fn exchange(
            &self,
            _method: &str,
            url: &str,
            authorization: &str,
            _: Option<&str>,
        ) -> Result<Exchange, Error> {
            self.calls
                .lock()
                .unwrap()
                .push((url.into(), authorization.into()));
            if url.ends_with("/content/1") {
                return Ok(Exchange {
                    status: 303,
                    retry_after: None,
                    body: Vec::new(),
                    location: Some("https://media.example/file".into()),
                    content_length: None,
                });
            }
            Ok(Exchange {
                status: 200,
                retry_after: None,
                body: b"png".to_vec(),
                location: None,
                content_length: Some(21 * 1024 * 1024),
            })
        }
    }
    let transport = Arc::new(Redirect {
        calls: Mutex::new(Vec::new()),
    });
    let credentials = Credentials::new("team", "user@example.com", "super-secret-token").unwrap();
    let client = Client::with_transport(&credentials, transport.clone());
    assert!(client
        .bytes("/rest/api/3/attachment/content/1")
        .unwrap()
        .is_none());
    let calls = transport.calls.lock().unwrap();
    assert!(calls[1].0.starts_with("https://media.example/file"));
    assert!(calls[1].1.is_empty());
    assert!(calls[0].1.starts_with("Basic "));
}

#[test]
fn a_page_write_forgets_the_list_cache() {
    let app = tempfile::tempdir().unwrap();
    let cached = CachedList {
        fetched_ms: 1_000,
        rows: vec![row("TB-1", "", "Open")],
        adf: Vec::new(),
    };
    super::save_list(
        app.path(),
        "https://team.atlassian.net",
        "assignee = currentUser()",
        &cached,
    )
    .unwrap();
    super::forget_lists(app.path(), "https://team.atlassian.net").unwrap();
    assert!(super::load_list(
        app.path(),
        "https://team.atlassian.net",
        "assignee = currentUser()",
        1_000
    )
    .unwrap()
    .is_none());
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

#[test]
fn rows_carry_sub_task_parent_status_category_and_avatar() {
    let issue = json!({
        "key": "TB-7",
        "fields": {
            "summary": "Wire it",
            "status": { "name": "In Review", "statusCategory": { "key": "indeterminate" } },
            "assignee": { "displayName": "Ada", "avatarUrls": { "24x24": "https://a.invalid/ada.png" } },
            "parent": { "key": "TB-3", "fields": { "issuetype": { "name": "Story" } } }
        }
    });
    let row = super::query::row(&issue, None, None);
    assert_eq!(row.parent_key, "TB-3");
    assert_eq!(row.status_category, "indeterminate");
    assert_eq!(row.assignee_avatar, "https://a.invalid/ada.png");

    let epic_child = json!({
        "key": "TB-8",
        "fields": { "parent": { "key": "EP-1", "fields": { "issuetype": { "name": "Epic" } } } }
    });
    let row = super::query::row(&epic_child, None, None);
    assert_eq!(row.parent_key, "");
    assert_eq!(row.epic_key, "EP-1");
}

#[test]
fn cached_rows_without_new_fields_still_load() {
    let row: Row = serde_json::from_value(json!({
        "key": "TB-1", "type_name": "", "summary": "", "status": "", "priority": "",
        "assignee": "", "sprint": "", "updated": "", "epic_key": "", "epic_summary": ""
    }))
    .unwrap();
    assert_eq!(row.parent_key, "");
}
