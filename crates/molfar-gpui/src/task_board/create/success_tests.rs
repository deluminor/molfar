use super::tests::window;
use gpui::{TestAppContext, VisualTestContext};
use molfar_core::store::Store;
use std::sync::{Arc, Mutex};

fn create_and_settle(cx: &mut TestAppContext, focus_elsewhere: bool) {
    let external = cx.update(|cx| cx.focus_handle());
    let directory = std::env::temp_dir().join(format!(
        "molfar-create-ui-{}",
        molfar_core::familiar::new_id()
    ));
    std::fs::create_dir_all(&directory).unwrap();
    for args in [
        vec!["init", "--quiet"],
        vec![
            "-c",
            "user.name=Board Test",
            "-c",
            "commit.gpgsign=false",
            "-c",
            "user.email=board@example.test",
            "commit",
            "--quiet",
            "--allow-empty",
            "-m",
            "fixture",
        ],
    ] {
        assert!(
            std::process::Command::new("git")
                .args(args)
                .current_dir(&directory)
                .status()
                .unwrap()
                .success()
        );
    }
    let path = directory.join("molfar.db");
    let store = Arc::new(Mutex::new(Store::open_desktop(&path).unwrap()));
    let project = directory.to_string_lossy().to_string();
    let window = window(cx);
    window
        .update(cx, |board, window, cx| {
            board.store = store;
            board.set_context(project.clone(), vec![project]);
            board.archived = true;
            board.project_only = true;
            board.open_create(window, cx);
            let draft = board.creation.as_mut().unwrap();
            draft
                .title
                .update(cx, |input, cx| input.set_text("Native task".into(), cx));
            draft.description.update(cx, |input, cx| {
                input.set_text("Keep source files safe".into(), cx)
            });
            board.submit_create(cx);
            if focus_elsewhere {
                window.focus(&external, cx);
            }
        })
        .unwrap();
    let visual = &mut VisualTestContext::from_window(window.into(), cx);
    visual.run_until_parked();
    window
        .update(visual, |board, window, cx| {
            assert!(!board.create_open);
            assert!(board.creation.is_none());
            assert!(!board.archived);
            assert_eq!(board.focus.is_focused(window), !focus_elsewhere);
            if focus_elsewhere {
                assert!(external.is_focused(window));
            }
            let snapshot = board.snapshot.as_ref().unwrap();
            assert_eq!(snapshot.cards.len(), 1);
            assert_eq!(snapshot.cards[0].title, "Native task");
            assert_eq!(board.selected.as_ref(), Some(&snapshot.cards[0].id));
            assert_eq!(snapshot.artifacts[0].kind, "task");
            board.store = Arc::new(Mutex::new(
                Store::open_desktop(std::path::Path::new(":memory:")).unwrap(),
            ));
            cx.notify();
        })
        .unwrap();
    std::fs::remove_dir_all(directory).unwrap();
}

#[gpui::test]
fn background_creation_selects_card_and_restores_its_focus(cx: &mut TestAppContext) {
    create_and_settle(cx, false);
}

#[gpui::test]
fn background_creation_never_steals_focus_from_another_destination(cx: &mut TestAppContext) {
    create_and_settle(cx, true);
}
