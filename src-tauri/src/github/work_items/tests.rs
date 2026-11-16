use super::*;

#[test]
fn parse_github_work_items_maps_issue_fields() {
    let json = r#"[{
            "number": 5138,
            "title": "Promo codes fail to apply",
            "url": "https://github.com/acme/web/issues/5138",
            "state": "OPEN",
            "stateReason": "",
            "createdAt": "2026-08-20T09:00:00Z",
            "updatedAt": "2026-08-27T08:00:00Z",
            "labels": [{"name": "bug", "color": "d73a4a"}],
            "assignees": [{"login": "maya"}]
        }]"#;
    let items = parse_github_work_items(json, "issue", "acme/web").unwrap();
    assert_eq!(items.len(), 1);
    assert_eq!(items[0].kind, "issue");
    assert_eq!(items[0].number, 5138);
    assert_eq!(items[0].state, "open");
    assert_eq!(items[0].state_reason, "");
    assert_eq!(items[0].repo, "acme/web");
    assert_eq!(items[0].labels[0].name, "bug");
    assert_eq!(items[0].assignees[0].login, "maya");
    assert_eq!(
        items[0].assignees[0].avatar_url,
        "https://avatars.githubusercontent.com/maya?s=64"
    );
    assert!(!items[0].draft);
    let payload = serde_json::to_value(&items[0]).unwrap();
    assert_eq!(payload["createdAt"], "2026-08-20T09:00:00Z");
    assert_eq!(payload["updatedAt"], "2026-08-27T08:00:00Z");
}

#[test]
fn parse_github_work_items_reads_issue_state_reason() {
    let json = r#"[{
            "number": 42,
            "title": "Ship the fix",
            "url": "https://github.com/acme/web/issues/42",
            "state": "CLOSED",
            "stateReason": "COMPLETED"
        }]"#;
    let items = parse_github_work_items(json, "issue", "acme/web").unwrap();
    assert_eq!(items[0].state, "closed");
    assert_eq!(items[0].state_reason, "completed");
    assert_eq!(
        serde_json::to_value(&items[0]).unwrap()["stateReason"],
        "completed"
    );
}

#[test]
fn parse_github_work_items_reads_draft_prs() {
    let json = r#"[{
            "number": 12,
            "title": "WIP checkout",
            "url": "https://github.com/acme/web/pull/12",
            "state": "OPEN",
            "isDraft": true
        }]"#;
    let items = parse_github_work_items(json, "pr", "acme/web").unwrap();
    assert_eq!(items[0].kind, "pr");
    assert!(items[0].draft);
    assert!(items[0].labels.is_empty());
    assert_eq!(items[0].repo, "acme/web");
}

#[test]
fn github_work_item_creation_time_reaches_frontend() {
    for (kind, resource) in [("pr", "pull"), ("issue", "issues")] {
        let json = r#"{
            "number": 12,
            "title": "Checkout",
            "url": "https://github.com/acme/web/pull/12",
            "state": "OPEN",
            "createdAt": "2026-09-01T08:00:00Z",
            "updatedAt": "2026-09-11T08:00:00Z"
        }"#;
        let json = json.replace("/pull/", &format!("/{resource}/"));
        let item = parse_github_work_item(&json, kind, "acme/web").unwrap();
        let payload = serde_json::to_value(item).unwrap();
        assert_eq!(payload["kind"], kind);
        assert_eq!(payload["createdAt"], "2026-09-01T08:00:00Z");
        assert_eq!(payload["updatedAt"], "2026-09-11T08:00:00Z");
    }
}

#[test]
fn parse_github_work_item_reads_view_shape() {
    let json = r#"{
            "number": 12,
            "title": "WIP checkout",
            "url": "https://github.com/acme/web/pull/12",
            "state": "OPEN",
            "isDraft": true
        }"#;
    let item = parse_github_work_item(json, "pr", "acme/web").unwrap();
    assert_eq!(item.number, 12);
    assert_eq!(item.kind, "pr");
    assert_eq!(item.repo, "acme/web");
    assert!(item.draft);
}
