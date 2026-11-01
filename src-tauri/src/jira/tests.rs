use super::write::{
    fields_query, pack_description_value, pack_write_fields, summarize_issue_payload, text_to_adf,
};
use super::*;

const SITE: &str = "https://acme.atlassian.net";

#[test]
fn fetches_every_project_page() {
    let mut offsets = Vec::new();
    let projects = fetch_jira_projects(|start| {
        offsets.push(start);
        Ok(if start == 0 {
            json!({ "startAt": 0, "isLast": false, "values": [
                { "id": "10000", "key": "ENG", "name": "Engineering" }
            ] })
        } else {
            json!({ "startAt": 1, "isLast": true, "values": [
                { "id": "10001", "key": "OPS", "name": "Operations" }
            ] })
        })
    })
    .unwrap();
    assert_eq!(offsets, vec![0, 1]);
    assert_eq!(projects.len(), 2);
    assert_eq!(projects[1].key, "OPS");
}

#[test]
fn rejects_stalled_project_pagination() {
    assert!(fetch_jira_projects(|_| Ok(json!({
        "isLast": false, "values": []
    })))
    .is_err());
}

#[test]
fn normalizes_jira_sites() {
    assert_eq!(normalize_jira_site("acme").unwrap(), SITE);
    assert_eq!(normalize_jira_site("acme.atlassian.net").unwrap(), SITE);
    assert_eq!(
        normalize_jira_site(" https://Acme.atlassian.net/jira/software/projects ").unwrap(),
        SITE
    );
    assert_eq!(
        normalize_jira_site("jira.example.com:8443").unwrap(),
        "https://jira.example.com:8443"
    );
    assert!(normalize_jira_site("http://acme.atlassian.net").is_err());
    assert!(normalize_jira_site("https://user@acme.atlassian.net").is_err());
    assert!(normalize_jira_site("").is_err());
}

#[test]
fn authorization_is_basic_email_and_token() {
    let config = JiraConfig {
        site: SITE.into(),
        email: "ada@acme.com".into(),
        token: "secret".into(),
    };
    assert_eq!(
        jira_authorization(&config),
        "Basic YWRhQGFjbWUuY29tOnNlY3JldA=="
    );
}

#[test]
fn issue_jql_combines_filters() {
    assert_eq!(
        issue_jql(true, "open", &[" 10000 ".into(), "".into(), "10001".into(), "x) OR (1".into()]),
        "assignee = currentUser() AND project in (10000, 10001) AND statusCategory != Done ORDER BY updated DESC"
    );
    assert_eq!(
        issue_jql(false, "all", &[]),
        "updated >= -365d ORDER BY updated DESC"
    );
}

#[test]
fn parse_jira_projects_reads_values() {
    let data = json!({
        "values": [
            { "id": "10000", "key": "ENG", "name": "Engineering" },
            { "id": "", "key": "SKIP", "name": "Skip" }
        ]
    });
    assert_eq!(
        parse_jira_projects(&data).unwrap(),
        vec![JiraProject {
            id: "10000".into(),
            key: "ENG".into(),
            name: "Engineering".into(),
        }]
    );
}

#[test]
fn parse_jira_issues_maps_fields() {
    let data = json!({
        "issues": [{
            "id": "10042",
            "key": "ENG-42",
            "fields": {
                "summary": "Fix auth",
                "updated": "2026-08-27T10:00:00.000+0000",
                "status": { "name": "In Progress", "statusCategory": { "key": "indeterminate" } },
                "labels": ["bug", "backend"],
                "assignee": {
                    "displayName": "Maya",
                    "avatarUrls": { "48x48": "https://avatar.example/maya.png" }
                },
                "project": { "id": "10000", "key": "ENG", "name": "Engineering" },
                "issuetype": { "name": "Story", "hierarchyLevel": 0 },
                "parent": { "key": "ENG-1", "fields": { "summary": "Auth epic" } }
            }
        }, { "id": "10043" }]
    });
    let items = parse_jira_issues(&data, SITE).unwrap();
    assert_eq!(items.len(), 1);
    let item = &items[0];
    assert_eq!(item.provider, "jira");
    assert_eq!(item.kind, "jira");
    assert_eq!(item.id, "10042");
    assert_eq!(item.identifier, "ENG-42");
    assert_eq!(item.number, 42);
    assert_eq!(item.url, "https://acme.atlassian.net/browse/ENG-42");
    assert_eq!(item.state, "In Progress");
    assert_eq!(item.state_type, "indeterminate");
    assert_eq!(item.updated_at, "2026-08-27T10:00:00.000+00:00");
    assert_eq!(item.labels[1].name, "backend");
    assert_eq!(item.assignees[0].login, "Maya");
    assert_eq!(
        item.assignees[0].avatar_url,
        "https://avatar.example/maya.png"
    );
    assert_eq!(item.repo, "ENG");
    assert_eq!(item.team_id, "10000");
    assert_eq!(item.team_name, "Engineering");
    assert_eq!(item.issue_type, "Story");
    assert_eq!(item.issue_type_hierarchy_level, Some(0));
    assert_eq!(item.parent_key, "ENG-1");
}

#[test]
fn parse_jira_issue_details_prefers_reporter() {
    let data = json!({
        "fields": {
            "description": {
                "type": "doc",
                "content": [{ "type": "paragraph", "content": [{ "type": "text", "text": "Steps" }] }]
            },
            "reporter": { "displayName": "Ada", "avatarUrls": { "48x48": "https://avatar.example/ada.png" } },
            "creator": { "displayName": "Lin" },
            "assignee": null
        }
    });
    let details = parse_jira_issue_details(&data).unwrap();
    assert_eq!(details.body, "Steps");
    assert_eq!(details.author, "Ada");
    assert_eq!(details.author_avatar_url, "https://avatar.example/ada.png");
}

#[test]
fn parse_jira_issue_thread_sorts_oldest_first() {
    let data = json!({
        "total": 3,
        "comments": [
            {
                "id": "2",
                "author": { "displayName": "Maya" },
                "body": "Plain reply",
                "created": "2026-08-31T11:00:00.000+0000"
            },
            {
                "id": "1",
                "author": { "displayName": "Ada" },
                "body": { "type": "doc", "content": [{ "type": "paragraph", "content": [{ "type": "text", "text": "Root" }] }] },
                "created": "2026-08-31T10:00:00.000+0000"
            }
        ]
    });
    let thread = parse_jira_issue_thread(&data, SITE, "ENG-42").unwrap();
    assert!(thread.truncated);
    assert_eq!(thread.comments.len(), 2);
    assert_eq!(thread.comments[0].body, "Root");
    assert_eq!(
        thread.comments[0].url,
        "https://acme.atlassian.net/browse/ENG-42?focusedCommentId=1"
    );
    assert_eq!(thread.comments[1].author, "Maya");
    assert_eq!(thread.comments[1].body, "Plain reply");
}

#[test]
fn text_to_adf_splits_paragraphs_and_lines() {
    assert_eq!(
        text_to_adf("First line\nsecond\n\nNext"),
        json!({
            "type": "doc",
            "version": 1,
            "content": [
                { "type": "paragraph", "content": [
                    { "type": "text", "text": "First line" },
                    { "type": "hardBreak" },
                    { "type": "text", "text": "second" }
                ]},
                { "type": "paragraph", "content": [{ "type": "text", "text": "Next" }] }
            ]
        })
    );
}

#[test]
fn normalizes_jira_offsets() {
    assert_eq!(
        normalize_jira_time("2026-08-27T10:00:00.000+0200"),
        "2026-08-27T10:00:00.000+02:00"
    );
    assert_eq!(
        normalize_jira_time("2026-08-27T10:00:00.000Z"),
        "2026-08-27T10:00:00.000Z"
    );
}

#[test]
fn issue_keys_are_validated() {
    assert_eq!(require_issue_key(" ENG-42 ").unwrap(), "ENG-42");
    assert!(require_issue_key("").is_err());
    assert!(require_issue_key("ENG-42/../x").is_err());
}

#[test]
fn jira_error_message_reads_both_shapes() {
    assert_eq!(
        jira_error_message(r#"{"errorMessages":["Issue does not exist"],"errors":{}}"#).as_deref(),
        Some("Issue does not exist")
    );
    assert_eq!(
        jira_error_message(r#"{"errorMessages":[],"errors":{"jql":"Bad JQL"}}"#).as_deref(),
        Some("Bad JQL")
    );
}

#[test]
fn pack_write_fields_converts_description_strings() {
    let packed = pack_write_fields(&json!({
        "summary": "New title",
        "description": "Line one\n\nLine two",
        "labels": ["a"]
    }))
    .unwrap();
    assert_eq!(packed["summary"], "New title");
    assert_eq!(packed["labels"], json!(["a"]));
    assert_eq!(packed["description"]["type"], "doc");
    assert!(pack_write_fields(&json!("nope")).is_err());
    assert!(pack_description_value(&json!({ "type": "paragraph" })).is_err());
    assert_eq!(
        pack_description_value(&json!({ "type": "doc", "version": 1, "content": [] })).unwrap()
            ["type"],
        "doc"
    );
}

#[test]
fn fields_query_defaults_and_all() {
    assert!(fields_query(None).contains("summary"));
    assert_eq!(fields_query(Some(&["*all".into()])), "*all");
    assert_eq!(
        fields_query(Some(&["summary".into(), "status".into()])),
        "summary,status"
    );
}

#[test]
fn summarize_issue_payload_flattens_description() {
    let payload = summarize_issue_payload(
        SITE,
        &json!({
            "id": "1",
            "key": "ENG-1",
            "fields": {
                "summary": "Hello",
                "description": {
                    "type": "doc",
                    "version": 1,
                    "content": [{
                        "type": "paragraph",
                        "content": [{ "type": "text", "text": "Body" }]
                    }]
                },
                "status": { "name": "To Do" },
                "issuetype": { "name": "Task" }
            }
        }),
    )
    .unwrap();
    assert_eq!(payload["key"], "ENG-1");
    assert_eq!(payload["url"], "https://acme.atlassian.net/browse/ENG-1");
    assert_eq!(payload["description"], "Body");
    assert_eq!(payload["fields"]["description"], "Body");
    assert_eq!(payload["status"], "To Do");
}
