use super::*;
use gpui::{TestAppContext, WindowHandle};

#[gpui::test]
fn board_is_a_native_destination_with_focus_tabs_and_escape(cx: &mut TestAppContext) {
    for classic in [false, true] {
        let (window, _, _) = super::tests::window(cx);
        window
            .update(cx, |shell, _, cx| {
                shell.workspace.classic_layout = classic;
                cx.notify();
            })
            .unwrap();
        let visual = &mut gpui::VisualTestContext::from_window(window.into(), cx);
        visual.run_until_parked();
        let navigation = visual.debug_bounds("sidebar-navigation-Board").unwrap();
        visual.simulate_click(navigation.center(), Default::default());
        visual.run_until_parked();
        window
            .update(visual, |shell, window, cx| {
                assert_eq!(shell.active_app_view, Some(app_views::AppView::Board));
                assert!(
                    shell
                        .board
                        .as_ref()
                        .unwrap()
                        .focus_handle(cx)
                        .is_focused(window)
                );
                assert_eq!(
                    shell
                        .workspace
                        .title_order
                        .contains(&TitleTab::App(app_views::AppView::Board)),
                    !classic,
                );
            })
            .unwrap();
        assert!(visual.debug_bounds("task-board").is_some());
        visual.simulate_keystrokes("p a r");
        visual.run_until_parked();
        window
            .update(visual, |shell, _, cx| {
                let board = shell.board.as_ref().unwrap().read(cx);
                assert!(board.project_only_for_test());
                assert!(board.archived_for_test());
            })
            .unwrap();
        visual.simulate_keystrokes("escape");
        visual.run_until_parked();
        window
            .update(visual, |shell, _, _| {
                assert!(shell.active_app_view.is_none())
            })
            .unwrap();
    }
}

fn open_board_settled(cx: &mut TestAppContext) -> (WindowHandle<Shell>, i64) {
    let (window, a, _) = super::tests::window(cx);
    window
        .update(cx, |shell, window, cx| shell.open_board(window, cx))
        .unwrap();
    cx.run_until_parked();
    (window, a)
}

fn board_renders(window: WindowHandle<Shell>, cx: &mut TestAppContext) -> usize {
    window
        .update(cx, |shell, _, cx| {
            shell.board.as_ref().unwrap().read(cx).renders_for_test()
        })
        .unwrap()
}

#[gpui::test]
fn the_board_is_not_rendered_again_by_an_unrelated_shell_notify(cx: &mut TestAppContext) {
    let (window, _) = open_board_settled(cx);
    let before = board_renders(window, cx);
    assert!(before > 0);

    for _ in 0..3 {
        window.update(cx, |_, _, cx| cx.notify()).unwrap();
        cx.run_until_parked();
    }

    assert_eq!(board_renders(window, cx), before);
}

#[gpui::test]
fn a_sidebar_spinner_tick_does_not_render_the_board(cx: &mut TestAppContext) {
    let (window, session) = open_board_settled(cx);
    cx.update(|cx| cx.set_reduce_motion(false));
    window
        .update(cx, |shell, _, cx| {
            shell.sessions[&session].update(cx, |session, cx| {
                session.busy = true;
                cx.emit(SessionChanged);
            });
        })
        .unwrap();
    cx.run_until_parked();
    let before = board_renders(window, cx);

    assert!(
        crate::pulse::running_for_test(cx),
        "the sidebar spinner leases the clock"
    );
    cx.executor().advance_clock(crate::pulse::TICK * 8);
    cx.run_until_parked();

    assert_eq!(board_renders(window, cx), before);
}

#[gpui::test]
fn an_idle_window_with_the_board_open_draws_almost_no_frames(cx: &mut TestAppContext) {
    let (window, _) = open_board_settled(cx);
    cx.update(|cx| cx.set_reduce_motion(false));
    cx.run_until_parked();
    let before = board_renders(window, cx);
    gpui::frame_stats::enable();
    gpui::frame_stats::take();

    cx.executor()
        .advance_clock(std::time::Duration::from_secs(20));
    cx.run_until_parked();

    let frames = gpui::frame_stats::take().frames;
    eprintln!("Idle Board: {frames} window draws in 20 simulated seconds");
    assert!(frames <= 4, "{frames} frames in 20 idle seconds");
    assert!(!crate::pulse::running_for_test(cx));
    assert_eq!(board_renders(window, cx), before);
}

#[gpui::test]
fn a_working_session_ticks_without_rendering_shell(cx: &mut TestAppContext) {
    let (window, session) = open_board_settled(cx);
    cx.update(|cx| cx.set_reduce_motion(false));
    window
        .update(cx, |shell, _, cx| {
            shell.sessions[&session].update(cx, |session, cx| {
                session.busy = true;
                cx.emit(SessionChanged);
            });
        })
        .unwrap();
    cx.run_until_parked();
    window.update(cx, |_, _, cx| cx.notify()).unwrap();
    cx.run_until_parked();
    gpui::frame_stats::enable();
    gpui::frame_stats::take();

    cx.executor().advance_clock(crate::pulse::TICK * 8);
    cx.run_until_parked();

    let stats = gpui::frame_stats::take();
    eprintln!("Working session, eight ticks: {stats:?}");
    assert_eq!(stats.views_rendered, 0, "{stats:?}");
    assert_eq!(stats.frames, 0, "{stats:?}");
    assert_eq!(stats.counters, [("animated-path-steps", 4)]);
}
