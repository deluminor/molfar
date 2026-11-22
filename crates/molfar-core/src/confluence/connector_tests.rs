use std::{
    cell::RefCell,
    collections::{HashSet, VecDeque},
};

use secrecy::SecretString;
use serde_json::{json, Value};
use url::Url;

use super::{
    cache::Cache,
    connector::{Connector, Kind, Node},
    error::ConfluenceError,
    http::{Client, Response, Transport},
    search::Scope,
};

struct Fixture(RefCell<VecDeque<(&'static str, Result<Value, ConfluenceError>)>>);

impl Transport for Fixture {
    fn get(&self, url: &Url, _: Option<&SecretString>) -> Result<Response, ConfluenceError> {
        let (path, value) = self
            .0
            .borrow_mut()
            .pop_front()
            .expect("one call per fixture");
        assert_eq!(&url[url::Position::BeforePath..], path);
        Ok(Response {
            status: 200,
            location: None,
            retry_after: None,
            link: None,
            bytes: serde_json::to_vec(&value?).unwrap(),
        })
    }
}

fn fixture(
    root: &std::path::Path,
    steps: impl IntoIterator<Item = (&'static str, Result<Value, ConfluenceError>)>,
) -> Connector<Fixture> {
    Connector {
        client: Client::new(
            Url::parse("https://fixture.atlassian.net").unwrap(),
            "fixture-auth".into(),
            Fixture(RefCell::new(steps.into_iter().collect())),
        ),
        cache: Cache::new(Some(root), "fixture"),
    }
}

#[test]
fn confluence_children_use_cursors_and_visible_spaces_exclude_hidden_ids() {
    let dir = tempfile::tempdir().unwrap();
    let connector = fixture(dir.path(), [
        ("/wiki/api/v2/spaces?limit=50&status=current", Ok(json!({"results":[{"id":"1","key":"PUBLIC","name":"Public","homepageId":"10"},{"id":"2","key":"HIDDEN","name":"Hidden"}]}))),
        ("/wiki/api/v2/pages/10/direct-children?limit=50", Ok(json!({"results":[{"id":"11","type":"folder","title":"Folder"}],"_links":{"next":"?cursor=%2Bnext"}}))),
        ("/wiki/api/v2/pages/10/direct-children?limit=50&cursor=%2Bnext", Ok(json!({"results":[{"id":"12","type":"page","title":"Page"}]}))),
        ("/wiki/rest/api/content/search?cql=type+%3D+page+AND+space+IN+%28%22PUBLIC%22%29+AND+title+%7E+%22%5C%22Page%5C%22%22&expand=space&limit=25", Ok(json!({"results":[{"id":"12","title":"Page","space":{"key":"PUBLIC"}},{"id":"22","title":"Page","space":{"key":"HIDDEN"}}]}))),
    ]);
    let hidden = HashSet::from(["2".into()]);
    let spaces = connector.visible_spaces(&hidden, false).unwrap();
    assert_eq!(spaces.len(), 1);
    let first = connector.children(&spaces[0], None, None, false).unwrap();
    assert_eq!(first.nodes[0].kind, Kind::Folder);
    assert_eq!(first.cursor.as_deref(), Some("+next"));
    let second = connector
        .children(&spaces[0], None, first.cursor.as_deref(), false)
        .unwrap();
    assert_eq!(second.nodes[0].id, "12");
    let results = connector
        .search("Page", None, &hidden, 25, Scope::Title)
        .unwrap();
    assert_eq!(results.len(), 1);
    assert_eq!(results[0].id, "12");
}

#[test]
fn confluence_pages_cache_versions_and_open_offline() {
    let dir = tempfile::tempdir().unwrap();
    let connector = fixture(
        dir.path(),
        [
            (
                "/wiki/api/v2/pages/10?body-format=atlas_doc_format",
                Ok(
                    json!({"title":"Guide","spaceId":"1","version":{"number":3},"body":{"atlas_doc_format":{"value":"{\"type\":\"doc\",\"content\":[{\"type\":\"text\",\"text\":\"Reference\"}]}"} }}),
                ),
            ),
            (
                "/wiki/api/v2/pages/10/labels?limit=50",
                Ok(json!({"results":[{"name":"reference"}]})),
            ),
            ("/wiki/api/v2/pages/10", Ok(json!({"version":{"number":3}}))),
            ("/wiki/api/v2/pages/10", Err(ConfluenceError::Offline)),
        ],
    );
    let page = connector.page("10", false).unwrap();
    assert_eq!(page.markdown().0, "Reference");
    assert_eq!(page.labels, ["reference"]);
    assert_eq!(connector.page("10", false).unwrap().version, 3);
    assert_eq!(
        connector.page("10", false).unwrap().markdown().0,
        "Reference"
    );

    let nodes: Vec<_> = (10..55)
        .map(|id| Node {
            id: id.to_string(),
            title: "Child".into(),
            kind: Kind::Page,
            space_key: "DOCS".into(),
            url: "https://fixture.atlassian.net/wiki".into(),
        })
        .collect();
    let index = connector.index(&nodes);
    assert_eq!(
        index.lines().filter(|line| line.starts_with("- ")).count(),
        40
    );
    assert!(index.contains("Reference"));
    assert!(index.chars().count() <= 8_000);
    assert_eq!(super::index::excerpt(&"𐍈".repeat(500)).chars().count(), 160);
    assert_cache_has_no_secret(dir.path());
}

#[test]
fn confluence_lineage_walks_folder_and_page_parents() {
    let dir = tempfile::tempdir().unwrap();
    let connector = fixture(
        dir.path(),
        [
            (
                "/wiki/api/v2/pages/30",
                Ok(json!({"title":"Child","parentId":"20","parentType":"folder"})),
            ),
            (
                "/wiki/api/v2/folders/20",
                Ok(json!({"title":"Notes","parentId":"10","parentType":"page"})),
            ),
            ("/wiki/api/v2/pages/10", Ok(json!({"title":"Root"}))),
        ],
    );
    let chain = connector.lineage(Some("30".into()), Kind::Page, "TEAM");
    assert_eq!(
        chain
            .iter()
            .map(|node| node.id.as_str())
            .collect::<Vec<_>>(),
        ["10", "20", "30"]
    );
    assert_eq!(
        chain
            .iter()
            .map(|node| node.title.as_str())
            .collect::<Vec<_>>(),
        ["Root", "Notes", "Child"]
    );
    assert_eq!(
        chain.iter().map(|node| node.kind).collect::<Vec<_>>(),
        [Kind::Page, Kind::Folder, Kind::Page]
    );
}

#[test]
fn confluence_lineage_keeps_known_ancestors_when_a_parent_fails() {
    let dir = tempfile::tempdir().unwrap();
    let connector = fixture(
        dir.path(),
        [
            (
                "/wiki/api/v2/pages/30",
                Ok(json!({"title":"Child","parentId":"20","parentType":"page"})),
            ),
            ("/wiki/api/v2/pages/20", Err(ConfluenceError::Offline)),
        ],
    );
    let chain = connector.lineage(Some("30".into()), Kind::Page, "TEAM");
    assert_eq!(
        chain
            .iter()
            .map(|node| node.id.as_str())
            .collect::<Vec<_>>(),
        ["30"]
    );
}

fn assert_cache_has_no_secret(dir: &std::path::Path) {
    for entry in std::fs::read_dir(dir).unwrap() {
        let path = entry.unwrap().path();
        if path.is_dir() {
            assert_cache_has_no_secret(&path);
            continue;
        }
        let text = String::from_utf8_lossy(&std::fs::read(&path).unwrap()).to_string();
        assert!(
            !text.contains("fixture-auth"),
            "{} contains the token",
            path.display()
        );
        assert!(
            !text.to_ascii_lowercase().contains("authorization"),
            "{} contains an authorization header",
            path.display()
        );
    }
}
