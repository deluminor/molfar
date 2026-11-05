use super::*;
use gpui::TestAppContext;

#[gpui::test]
fn home_is_first_in_navigation_opens_and_persists_its_layout(cx: &mut TestAppContext) {
    for classic in [false, true] {
        let (window, _, _) = super::tests::window(cx);
        window
            .update(cx, |shell, _, cx| {
                shell.workspace.classic_layout = classic;
                shell.workspace.home_layout = serde_json::json!({"hidden": ["matrix"]});
                cx.notify();
            })
            .unwrap();
        let visual = &mut gpui::VisualTestContext::from_window(window.into(), cx);
        visual.run_until_parked();

        let home = visual.debug_bounds("sidebar-navigation-Home").unwrap();
        let inbox = visual.debug_bounds("sidebar-navigation-Inbox").unwrap();
        assert!(home.top() < inbox.top());

        visual.simulate_click(home.center(), Default::default());
        visual.run_until_parked();
        window
            .update(visual, |shell, window, cx| {
                assert_eq!(shell.active_app_view, Some(app_views::AppView::Home));
                assert!(
                    shell
                        .home
                        .as_ref()
                        .unwrap()
                        .focus_handle(cx)
                        .is_focused(window)
                );
            })
            .unwrap();
        assert!(visual.debug_bounds("home").is_some());
        assert!(visual.debug_bounds("home-card-matrix").is_none());

        window
            .update(visual, |shell, _, cx| {
                let home = shell.home.clone().unwrap();
                home.update(cx, |_, cx| {
                    cx.emit(crate::home::Event::Layout(
                        serde_json::json!({"hidden": []}),
                    ))
                });
            })
            .unwrap();
        visual.run_until_parked();
        window
            .update(visual, |shell, _, _| {
                assert_eq!(shell.workspace.home_layout["hidden"], serde_json::json!([]));
            })
            .unwrap();

        visual.simulate_keystrokes("escape");
        visual.run_until_parked();
        window
            .update(visual, |shell, _, _| {
                assert_eq!(shell.active_app_view, None)
            })
            .unwrap();
    }
}
