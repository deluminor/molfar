use super::*;
use gpui::TestAppContext;

#[gpui::test]
fn knowledge_opens_from_the_sidebar_and_escape_closes_it(cx: &mut TestAppContext) {
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
        let navigation = visual.debug_bounds("sidebar-navigation-Knowledge").unwrap();
        visual.simulate_click(navigation.center(), Default::default());
        visual.run_until_parked();
        window
            .update(visual, |shell, window, cx| {
                assert_eq!(shell.active_app_view, Some(app_views::AppView::Knowledge));
                assert!(
                    shell
                        .knowledge
                        .as_ref()
                        .unwrap()
                        .focus_handle(cx)
                        .is_focused(window)
                );
                assert_eq!(
                    shell
                        .workspace
                        .title_order
                        .contains(&TitleTab::App(app_views::AppView::Knowledge)),
                    !classic,
                );
            })
            .unwrap();
        assert!(visual.debug_bounds("knowledge").is_some());
        visual.simulate_keystrokes("escape");
        visual.run_until_parked();
        window
            .update(visual, |shell, _, _| {
                assert!(shell.active_app_view.is_none())
            })
            .unwrap();
    }
}

#[test]
fn a_persisted_knowledge_tab_restores() {
    let mut workspace = Workspace::default();
    workspace
        .title_order
        .push(TitleTab::App(app_views::AppView::Knowledge));
    let saved = serde_json::to_string(&workspace).unwrap();
    let restored = Workspace::restore(Some(&saved), &[], "/tmp/molfar-knowledge");
    assert!(
        restored
            .title_order
            .contains(&TitleTab::App(app_views::AppView::Knowledge))
    );
}
