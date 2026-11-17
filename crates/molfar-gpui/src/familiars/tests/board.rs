use super::*;
use std::process::Command;

fn commit(project: &str) {
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
        assert!(
            Command::new("git")
                .current_dir(project)
                .args(args)
                .status()
                .unwrap()
                .success()
        );
    }
}

fn settle(
    s: &Setup,
    request: &str,
    action: &str,
    input: Value,
    cx: &mut TestAppContext,
) -> Result<Value, String> {
    let reply = call(s, request, action, input, cx);
    cx.run_until_parked();
    reply.try_recv().expect("the Board action must settle")
}

#[gpui::test]
fn familiar_board_actions_reach_assigned_projects_and_dedupe_creation(cx: &mut TestAppContext) {
    let s = setup_shared(cx);
    commit(&s.project);
    let input = json!({"project":s.project,"title":"From a Familiar","description":"Plan it"});

    let card = settle(&s, "board-create", "board.create", input.clone(), cx).unwrap();
    let retry = settle(&s, "board-create", "board.create", input, cx).unwrap();
    let foreign = settle(
        &s,
        "board-foreign",
        "board.create",
        json!({"project":"/elsewhere","title":"x","description":"x"}),
        cx,
    );

    assert_eq!(card, retry);
    assert!(foreign.is_err());
    let id = card["card"]["id"].as_str().unwrap().to_owned();
    let listed = settle(&s, "board-list", "board.list", json!({}), cx).unwrap();
    assert_eq!(listed["cards"][0]["id"], json!(id));
    let snapshot = locked(&s.store)
        .unwrap()
        .board_snapshot(None, false, Some(&id))
        .unwrap();
    assert_eq!(snapshot.cards.len(), 1);
    assert!(snapshot.runs.is_empty());
    assert_eq!(snapshot.cards[0].column_id, "backlog");
    let archived = settle(
        &s,
        "board-archive",
        "board.archive",
        json!({"cardId":id}),
        cx,
    )
    .unwrap();
    assert_eq!(archived["card"]["archived"], true);
}
