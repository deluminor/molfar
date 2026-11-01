use super::*;
use crate::input;
use gpui::{
    AppContext, Bounds, TestAppContext, VisualTestContext, WindowBounds, WindowOptions, point, px,
    size,
};
use molfar_core::store::Store;
use std::sync::{Arc, Mutex};

pub(super) fn window(cx: &mut TestAppContext) -> gpui::WindowHandle<Board> {
    cx.update(|cx| {
        input::bind(cx);
        cx.set_reduce_motion(true);
        cx.open_window(
            WindowOptions {
                window_bounds: Some(WindowBounds::Windowed(Bounds::new(
                    point(px(0.), px(0.)),
                    size(px(1000.), px(800.)),
                ))),
                ..Default::default()
            },
            |_, cx| {
                cx.new(|cx| {
                    Board::new(
                        Arc::new(Mutex::new(
                            Store::open_desktop(std::path::Path::new(":memory:")).unwrap(),
                        )),
                        cx,
                    )
                })
            },
        )
        .unwrap()
    })
}

#[gpui::test]
fn creation_keeps_draft_focus_and_does_not_trigger_board_shortcuts(cx: &mut TestAppContext) {
    let window = window(cx);
    window
        .update(cx, |board, window, cx| {
            board.set_context("/project".into(), vec!["/project".into()]);
            board.open_create(window, cx);
        })
        .unwrap();
    let visual = &mut VisualTestContext::from_window(window.into(), cx);
    visual.run_until_parked();
    assert!(visual.debug_bounds("board-create-dialog").is_some());
    visual.simulate_input("prepare a report");
    visual.simulate_keystrokes("tab");
    window
        .update(visual, |board, window, cx| {
            let draft = board.creation.as_ref().unwrap();
            assert_eq!(draft.title.read(cx).content.as_ref(), "prepare a report");
            assert!(
                draft
                    .description
                    .read(cx)
                    .focus_handle(cx)
                    .is_focused(window)
            );
            assert!(!board.project_only && !board.archived);
        })
        .unwrap();
    visual.simulate_keystrokes("escape");
    visual.run_until_parked();
    window
        .update(visual, |board, window, cx| {
            assert!(!board.create_open);
            assert!(board.focus.is_focused(window));
            let id = board.creation.as_ref().unwrap().id.clone();
            board.open_create(window, cx);
            assert_eq!(board.creation.as_ref().unwrap().id, id);
            assert_eq!(
                board
                    .creation
                    .as_ref()
                    .unwrap()
                    .title
                    .read(cx)
                    .content
                    .as_ref(),
                "prepare a report"
            );
        })
        .unwrap();
}

#[gpui::test]
fn creation_failure_retains_identity_and_busy_guard_prevents_second_submit(
    cx: &mut TestAppContext,
) {
    let window = window(cx);
    window
        .update(cx, |board, window, cx| {
            board.set_context("/project".into(), vec!["/project".into()]);
            board.open_create(window, cx);
            let draft = board.creation.as_mut().unwrap();
            draft
                .title
                .update(cx, |input, cx| input.set_text("Task".into(), cx));
            draft.busy = true;
            board.submit_create(cx);
            board.close_create(window, cx);
            assert!(board.create_open);
            let id = board.creation.as_ref().unwrap().id.clone();
            board.finish_create(&id, Err("Artifact write failed".into()), window, cx);
            let draft = board.creation.as_ref().unwrap();
            assert_eq!(draft.id, id);
            assert_eq!(draft.title.read(cx).content.as_ref(), "Task");
            assert!(!draft.busy);
            assert_eq!(draft.error.as_deref(), Some("Artifact write failed"));
        })
        .unwrap();
    let visual = &mut VisualTestContext::from_window(window.into(), cx);
    visual.run_until_parked();
    assert!(visual.debug_bounds("board-create-error").is_some());
    window
        .update(visual, |board, window, cx| {
            let external = cx.focus_handle();
            window.focus(&external, cx);
            let restored = board.focus_handle(cx);
            window.focus(&restored, cx);
            assert!(
                board
                    .creation
                    .as_ref()
                    .unwrap()
                    .title
                    .read(cx)
                    .focus_handle(cx)
                    .is_focused(window)
            );
        })
        .unwrap();
    visual.simulate_input(" retry");
    window
        .update(visual, |board, _, cx| {
            assert!(
                board
                    .creation
                    .as_ref()
                    .unwrap()
                    .title
                    .read(cx)
                    .content
                    .contains("retry")
            );
        })
        .unwrap();
}

#[gpui::test]
fn reduced_motion_form_is_immediately_visible_and_tab_cycles_actions(cx: &mut TestAppContext) {
    cx.update(|cx| cx.set_reduce_motion(true));
    let window = window(cx);
    window
        .update(cx, |board, window, cx| {
            board.set_context("/project".into(), vec!["/project".into()]);
            board.open_create(window, cx);
        })
        .unwrap();
    let visual = &mut VisualTestContext::from_window(window.into(), cx);
    visual.run_until_parked();
    assert!(visual.debug_bounds("board-create-dialog").is_some());
    for _ in 0..5 {
        visual.simulate_keystrokes("tab");
    }
    window
        .update(visual, |board, window, _| {
            assert!(
                board
                    .creation
                    .as_ref()
                    .unwrap()
                    .submit_focus
                    .is_focused(window)
            )
        })
        .unwrap();
    visual.simulate_keystrokes("tab");
    window
        .update(visual, |board, window, _| {
            assert!(
                board
                    .creation
                    .as_ref()
                    .unwrap()
                    .project_focus
                    .is_focused(window)
            )
        })
        .unwrap();
    visual.simulate_keystrokes("shift-tab");
    window
        .update(visual, |board, window, _| {
            assert!(
                board
                    .creation
                    .as_ref()
                    .unwrap()
                    .submit_focus
                    .is_focused(window)
            )
        })
        .unwrap();
}

#[gpui::test]
fn composing_text_never_submits_from_the_dialog_shortcut(cx: &mut TestAppContext) {
    use gpui::EntityInputHandler;
    let window = window(cx);
    window
        .update(cx, |board, window, cx| {
            board.open_create(window, cx);
        })
        .unwrap();
    let visual = &mut VisualTestContext::from_window(window.into(), cx);
    visual.run_until_parked();
    for multiline in [false, true] {
        window
            .update(visual, |board, window, cx| {
                let draft = board.creation.as_ref().unwrap();
                let input = if multiline {
                    draft.description.clone()
                } else {
                    draft.title.clone()
                };
                window.focus(&input.read(cx).focus_handle(cx), cx);
                input.update(cx, |input, cx| {
                    input.replace_and_mark_text_in_range(None, "日本", Some(2..2), window, cx)
                });
            })
            .unwrap();
        visual.simulate_keystrokes(if cfg!(target_os = "macos") {
            "cmd-enter"
        } else {
            "ctrl-enter"
        });
        window
            .update(visual, |board, _, _| {
                let draft = board.creation.as_ref().unwrap();
                assert!(!draft.busy);
                assert!(draft.error.is_none());
                assert!(board.create_open);
            })
            .unwrap();
    }
}
