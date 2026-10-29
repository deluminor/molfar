use super::*;
use gpui::TestAppContext;

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
