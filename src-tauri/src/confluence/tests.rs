use serde_json::json;

use super::page::parse_page;
use super::parse::{parse_spaces, parse_v2_pages, valid_id};
use super::search::{build_search_cql, parse_search_results};
use super::types::HttpError;

#[test]
fn search_cql_escapes_and_scopes_space() {
    assert_eq!(
        build_search_cql(r#"hyper "opt""#, ""),
        r#"type in (page,folder,blogpost) AND text ~ "hyper \"opt\"" ORDER BY lastmodified DESC"#
    );
    assert_eq!(
        build_search_cql("engine", "TB"),
        r#"type in (page,folder,blogpost) AND text ~ "engine" AND space = "TB" ORDER BY lastmodified DESC"#
    );
}

#[test]
fn parses_spaces_and_search() {
    let spaces = parse_spaces(&json!({
        "results": [
            { "id": "1", "key": "TB", "name": "Trading Book" },
            { "id": "2", "key": "ENG", "name": "Engineering" }
        ]
    }));
    assert_eq!(spaces.len(), 2);
    assert_eq!(spaces[0].key, "TB");

    let hits = parse_search_results(
        &json!({
            "results": [{
                "content": {
                    "id": "99",
                    "type": "page",
                    "title": "Search Engine",
                    "space": { "id": "1", "key": "TB" },
                    "ancestors": [{ "id": "10" }],
                    "_links": { "webui": "/spaces/TB/pages/99/Search+Engine" }
                }
            }]
        }),
        "https://monly.atlassian.net",
    );
    assert_eq!(hits.len(), 1);
    assert_eq!(hits[0].id, "99");
    assert_eq!(hits[0].space_key, "TB");
    assert_eq!(hits[0].parent_id, "10");
    assert!(hits[0].readable);
    assert!(hits[0].url.contains("/spaces/TB/pages/99"));
}

#[test]
fn parses_v2_children_and_unsupported_kinds() {
    let nodes = parse_v2_pages(
        &json!({
            "results": [
                { "id": "1", "title": "Doc", "spaceId": "s", "parentId": "p", "status": "current" },
                { "folder": { "id": "2", "title": "Technical docs", "spaceId": "s", "parentId": "p" } },
                { "whiteboard": { "id": "3", "title": "Board", "spaceId": "s" } }
            ]
        }),
        "s",
        "TB",
        "p",
        "https://monly.atlassian.net",
    );
    assert_eq!(nodes.len(), 3);
    assert_eq!(nodes[0].kind, "page");
    assert!(nodes[0].readable);
    assert!(nodes[0].has_children);
    assert_eq!(nodes[1].kind, "folder");
    assert!(nodes[1].has_children);
    assert!(!nodes[1].readable);
    assert_eq!(nodes[2].kind, "whiteboard");
    assert!(!nodes[2].readable);
}

#[test]
fn parses_direct_children_flat_type_payload() {
    let nodes = parse_v2_pages(
        &json!({
            "results": [
                {
                    "id": "10",
                    "status": "current",
                    "title": "STAGE 5: VALIDATION",
                    "type": "folder",
                    "spaceId": "s",
                    "childPosition": 3
                },
                {
                    "id": "11",
                    "status": "current",
                    "title": "Useful Links",
                    "type": "page",
                    "spaceId": "s",
                    "childPosition": 9,
                    "hasChildren": false
                }
            ]
        }),
        "s",
        "TB",
        "33193986",
        "https://monly.atlassian.net",
    );
    assert_eq!(nodes.len(), 2);
    assert_eq!(nodes[0].kind, "folder");
    assert!(nodes[0].has_children);
    assert_eq!(nodes[0].parent_id, "33193986");
    assert_eq!(nodes[1].kind, "page");
    assert!(!nodes[1].has_children);
    assert!(nodes[1].readable);
}

#[test]
fn child_position_does_not_imply_has_children() {
    let nodes = parse_v2_pages(
        &json!({
            "results": [{
                "id": "7",
                "title": "Leaf",
                "type": "page",
                "spaceId": "s",
                "childPosition": 42,
                "hasChildren": false
            }]
        }),
        "s",
        "TB",
        "1",
        "https://example.atlassian.net",
    );
    assert_eq!(nodes.len(), 1);
    assert!(!nodes[0].has_children);
}

#[test]
fn page_body_from_adf_string() {
    let page = parse_page(
        &json!({
            "id": "42",
            "title": "Blueprint",
            "spaceId": "s",
            "parentId": "1",
            "body": {
                "atlas_doc_format": {
                    "value": "{\"type\":\"doc\",\"content\":[{\"type\":\"paragraph\",\"content\":[{\"type\":\"text\",\"text\":\"Hello\"}]}]}"
                }
            },
            "_links": { "webui": "/spaces/TB/pages/42/Blueprint" }
        }),
        "https://monly.atlassian.net",
    )
    .unwrap();
    assert_eq!(page.body, "Hello");
    assert!(page.readable);
    assert!(!page.truncated);
}

#[test]
fn rejects_bad_ids() {
    assert!(!valid_id(""));
    assert!(!valid_id("../x"));
    assert!(valid_id("33193986"));
}

#[test]
fn not_found_prefers_http_status() {
    assert!(HttpError {
        status: Some(404),
        message: "Confluence could not find that page".into(),
    }
    .is_not_found());
    assert!(HttpError {
        status: Some(404),
        message: "totally custom upstream wording".into(),
    }
    .is_not_found());
    assert!(!HttpError {
        status: Some(403),
        message: "denied".into(),
    }
    .is_not_found());
    assert!(HttpError {
        status: None,
        message: "Resource not found".into(),
    }
    .is_not_found());
}
