use super::action;
use crate::store::Store;
use serde_json::{json, Value};
use std::{path::Path, process::Command};

fn project(path: &Path) -> String {
    std::fs::create_dir(path).unwrap();
    for args in [
        &["init", "-q"][..],
        &[
            "-c",
            "user.name=Fixture",
            "-c",
            "user.email=fixture@example.test",
            "-c",
            "commit.gpgsign=false",
            "commit",
            "--allow-empty",
            "-qm",
            "fixture",
        ],
    ] {
        assert!(Command::new("git")
            .current_dir(path)
            .args(args)
            .status()
            .unwrap()
            .success());
    }
    path.to_str().unwrap().to_owned()
}

struct Fixture {
    _dir: tempfile::TempDir,
    store: Store,
    mine: String,
    other: String,
}

fn fixture() -> Fixture {
    let dir = tempfile::tempdir().unwrap();
    let mine = project(&dir.path().join("mine"));
    let other = project(&dir.path().join("other"));
    let store = Store::open_desktop(&dir.path().join("molfar.db")).unwrap();
    Fixture {
        _dir: dir,
        store,
        mine,
        other,
    }
}

fn call(f: &mut Fixture, name: &str, input: Value) -> Result<Value, String> {
    let projects = [f.mine.clone()];
    let envelope = input["requestId"].as_str().unwrap_or("envelope").to_owned();
    action(
        &mut f.store,
        "operator:7",
        &envelope,
        name,
        &input,
        &projects,
    )
}

fn create(f: &mut Fixture, request: &str, title: &str) -> Result<Value, String> {
    let project = f.mine.clone();
    call(
        f,
        "board.create",
        json!({"project":project,"title":title,"description":"Do it","requestId":request}),
    )
}

#[test]
fn create_saves_one_idle_backlog_card_and_dedupes_by_request_id() {
    let mut f = fixture();

    let card = create(&mut f, "create-1", "First").unwrap();
    let retry = create(&mut f, "create-1", " First ").unwrap();
    let changed = create(&mut f, "create-1", "Changed").unwrap_err();

    assert_eq!(card["card"]["id"], retry["card"]["id"]);
    assert_eq!(card["card"]["column"], "backlog");
    assert_eq!(card["card"]["runState"], "idle");
    assert!(changed.contains("different input"), "{changed}");
    let listed = call(&mut f, "board.list", json!({})).unwrap();
    assert_eq!(listed["cards"].as_array().unwrap().len(), 1);
    let id = card["card"]["id"].as_str().unwrap();
    let read = call(&mut f, "board.read", json!({"cardId":id})).unwrap();
    assert_eq!(read["runs"], json!([]));
    assert_eq!(read["questions"], json!([]));
    assert_eq!(read["artifacts"][0]["kind"], "task");
    assert!(f.store.board_claim_next_stage().unwrap().is_none());
}

#[test]
fn unassigned_projects_and_foreign_cards_are_rejected_uniformly() {
    let mut f = fixture();
    let other = f.other.clone();
    let foreign = action(
        &mut f.store,
        "operator:8",
        "r",
        "board.create",
        &json!({"project":other,"title":"Foreign","description":"x","requestId":"r"}),
        std::slice::from_ref(&other),
    )
    .unwrap();
    let foreign = foreign["card"]["id"].as_str().unwrap().to_owned();

    assert!(call(
        &mut f,
        "board.create",
        json!({"project":other,"title":"x","description":"x","requestId":"r"})
    )
    .is_err());
    assert!(call(&mut f, "board.list", json!({"project":other})).is_err());
    assert_eq!(
        call(&mut f, "board.list", json!({})).unwrap()["cards"],
        json!([])
    );
    let missing = call(&mut f, "board.read", json!({"cardId":"missing"})).unwrap_err();
    for name in ["board.read", "board.archive", "board.unarchive"] {
        assert_eq!(
            call(&mut f, name, json!({"cardId":foreign})).unwrap_err(),
            missing
        );
    }
    assert_eq!(
        call(
            &mut f,
            "board.update",
            json!({"cardId":foreign,"title":"x"})
        )
        .unwrap_err(),
        missing
    );
}

#[test]
fn update_versions_the_task_only_for_idle_backlog_cards() {
    let mut f = fixture();
    let card = create(&mut f, "create", "First").unwrap();
    let id = card["card"]["id"].as_str().unwrap().to_owned();

    let updated = call(
        &mut f,
        "board.update",
        json!({"cardId":id,"title":"Renamed","acceptanceCriteria":"Works"}),
    )
    .unwrap();
    call(
        &mut f,
        "board.update",
        json!({"cardId":id,"title":"Renamed"}),
    )
    .unwrap();

    assert_eq!(updated["card"]["title"], "Renamed");
    assert_eq!(updated["card"]["description"], "Do it");
    let read = call(&mut f, "board.read", json!({"cardId":id})).unwrap();
    assert_eq!(read["artifacts"].as_array().unwrap().len(), 2);
    let first = call(
        &mut f,
        "board.read",
        json!({"cardId":id,"artifactKind":"task","artifactVersion":1}),
    )
    .unwrap();
    assert!(first["artifact"]["body"]
        .as_str()
        .unwrap()
        .contains("First"));
    let latest = call(
        &mut f,
        "board.read",
        json!({"cardId":id,"artifactKind":"task"}),
    )
    .unwrap();
    assert!(latest["artifact"]["body"]
        .as_str()
        .unwrap()
        .contains("Works"));
    assert_eq!(latest["artifact"]["version"], 2);
    assert!(call(&mut f, "board.update", json!({"cardId":id})).is_err());

    rusqlite::Connection::open(f._dir.path().join("molfar.db"))
        .unwrap()
        .execute(
            "UPDATE task_board_cards SET column_id='grill' WHERE id=?1",
            [&id],
        )
        .unwrap();
    let error = call(&mut f, "board.update", json!({"cardId":id,"title":"Late"})).unwrap_err();
    assert!(error.contains("idle Backlog"), "{error}");
}

#[test]
fn archive_round_trip_moves_cards_between_listings_without_stage_changes() {
    let mut f = fixture();
    let card = create(&mut f, "create", "First").unwrap();
    let id = card["card"]["id"].as_str().unwrap().to_owned();

    let archived = call(&mut f, "board.archive", json!({"cardId":id})).unwrap();
    call(&mut f, "board.archive", json!({"cardId":id})).unwrap();

    assert_eq!(archived["card"]["archived"], true);
    assert_eq!(
        call(&mut f, "board.list", json!({})).unwrap()["cards"],
        json!([])
    );
    let listed = call(&mut f, "board.list", json!({"archived":true})).unwrap();
    assert_eq!(listed["cards"][0]["id"], json!(id));
    assert!(call(&mut f, "board.update", json!({"cardId":id,"title":"x"})).is_err());
    let restored = call(&mut f, "board.unarchive", json!({"cardId":id})).unwrap();
    assert_eq!(restored["card"]["archived"], false);
    assert_eq!(restored["card"]["column"], "backlog");
}

#[test]
fn list_pages_are_bounded_and_arguments_strict() {
    let mut f = fixture();
    for request in ["a", "b", "c"] {
        create(&mut f, request, request).unwrap();
    }

    let first = call(&mut f, "board.list", json!({"limit":2})).unwrap();
    let rest = call(&mut f, "board.list", json!({"limit":2,"offset":2})).unwrap();

    assert_eq!(first["cards"].as_array().unwrap().len(), 2);
    assert_eq!(first["nextOffset"], 2);
    assert_eq!(rest["cards"].as_array().unwrap().len(), 1);
    assert_eq!(rest["nextOffset"], Value::Null);
    for input in [
        json!({"limit":0}),
        json!({"limit":101}),
        json!({"archived":"yes"}),
        json!({"stage":"grill"}),
    ] {
        assert!(call(&mut f, "board.list", input).is_err());
    }
    assert!(call(&mut f, "board.queue", json!({"cardId":"x"})).is_err());
}
