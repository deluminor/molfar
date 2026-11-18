use super::*;
use std::{
    process::Command,
    sync::{Arc, Mutex},
};

fn project(root: &std::path::Path) -> String {
    let path = root.join("project");
    std::fs::create_dir_all(&path).unwrap();
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
                .current_dir(&path)
                .args(args)
                .status()
                .unwrap()
                .success()
        );
    }
    path.to_str().unwrap().to_owned()
}

fn operator_window(
    root: &std::path::Path,
    settings: Settings,
    cx: &mut TestAppContext,
) -> (WindowHandle<Shell>, i64, String) {
    let project = project(root);
    let store = Store::open_desktop(&root.join("molfar.db")).unwrap();
    let summary = store.create("codex", &project).unwrap();
    let id = summary.id;
    let store = Arc::new(Mutex::new(store));
    let cwd = project.clone();
    let window = cx.update(|cx| {
        cx.open_window(Default::default(), |_, cx| {
            cx.new(|cx| {
                let mut shell = Shell::new(store, vec![summary], cwd, None, cx);
                shell.ensure_session(id, cx);
                shell
            })
        })
        .unwrap()
    });
    cx.run_until_parked();
    window
        .update(cx, |shell, _, cx| {
            shell.sessions[&id].update(cx, |v, cx| v.install_transfer(settings, None, cx));
        })
        .unwrap();
    cx.run_until_parked();
    (window, id, project)
}

#[gpui::test]
fn operator_board_actions_stay_in_the_thread_project_and_dedupe(cx: &mut TestAppContext) {
    let root = std::env::temp_dir().join(format!(
        "molfar-operator-board-{}",
        molfar_core::familiar::new_id()
    ));
    let settings = Settings {
        operator_enabled: true,
        ..Default::default()
    };
    let (window, caller, project) = operator_window(&root, settings, cx);
    let input = json!({"project":project,"title":"From a session","description":"Plan it"});

    let card = call(
        window,
        caller,
        "board-create",
        "board.create",
        input.clone(),
        cx,
    )
    .unwrap();
    let retry = call(window, caller, "board-create", "board.create", input, cx).unwrap();
    let changed = call(
        window,
        caller,
        "board-create",
        "board.create",
        json!({"project":project,"title":"Other","description":"Plan it"}),
        cx,
    );
    let foreign = call(
        window,
        caller,
        "board-foreign",
        "board.create",
        json!({"project":"/elsewhere","title":"x","description":"x"}),
        cx,
    );

    assert_eq!(card, retry);
    assert!(changed.unwrap_err().contains("different input"));
    assert!(foreign.is_err());
    let id = card["card"]["id"].as_str().unwrap().to_owned();
    let updated = call(
        window,
        caller,
        "board-update",
        "board.update",
        json!({"cardId":id,"title":"Renamed"}),
        cx,
    )
    .unwrap();
    assert_eq!(updated["card"]["title"], "Renamed");
    let read = call(
        window,
        caller,
        "board-read",
        "board.read",
        json!({"cardId":id}),
        cx,
    )
    .unwrap();
    assert_eq!(read["artifacts"].as_array().unwrap().len(), 2);
    assert_eq!(read["runs"], json!([]));
    assert!(
        call(
            window,
            caller,
            "board-stage",
            "board.queue",
            json!({"cardId":id}),
            cx
        )
        .is_err()
    );
}

#[gpui::test]
fn read_only_operator_threads_can_read_but_not_change_the_board(cx: &mut TestAppContext) {
    let root = std::env::temp_dir().join(format!(
        "molfar-operator-board-{}",
        molfar_core::familiar::new_id()
    ));
    let settings = Settings {
        operator_enabled: true,
        access: molfar_core::agent::AccessMode::ReadOnly,
        ..Default::default()
    };
    let (window, caller, project) = operator_window(&root, settings, cx);

    let listed = call(window, caller, "board-list", "board.list", json!({}), cx).unwrap();
    let created = call(
        window,
        caller,
        "board-create",
        "board.create",
        json!({"project":project,"title":"x","description":"x"}),
        cx,
    );

    assert_eq!(listed["cards"], json!([]));
    assert!(created.unwrap_err().contains("read-only"));
    let _ = std::fs::remove_dir_all(&root);
}
