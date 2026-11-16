use super::*;
use gpui::TestAppContext;

const SWITCHES: [(&str, &str); 6] = [
    ("sidebar-home", "sidebar-navigation-Home"),
    ("sidebar-inbox", "sidebar-navigation-Inbox"),
    ("sidebar-board", "sidebar-navigation-Board"),
    ("sidebar-notes", "sidebar-navigation-Notes"),
    ("sidebar-knowledge", "sidebar-navigation-Knowledge"),
    ("sidebar-automations", "sidebar-navigation-Automations"),
];

#[gpui::test]
fn every_navigation_destination_hides_from_sidebar_options(cx: &mut TestAppContext) {
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
        for (_, label) in SWITCHES {
            assert!(
                visual.debug_bounds(label).is_some(),
                "{label} is listed by default"
            );
        }

        window
            .update(visual, |shell, _, cx| {
                for (action, _) in SWITCHES {
                    shell.change_sidebar_option(action, cx);
                }
            })
            .unwrap();
        visual.run_until_parked();
        for (_, label) in SWITCHES {
            assert!(visual.debug_bounds(label).is_none(), "{label} hides");
        }

        window
            .update(visual, |shell, _, _| {
                let items = shell.sidebar_options_menu_items();
                let ids: Vec<_> = items
                    .iter()
                    .filter_map(|item| match item {
                        MenuItem::Action(action) => Some(action.id.to_string()),
                        _ => None,
                    })
                    .collect();
                for (action, _) in SWITCHES {
                    assert!(ids.iter().any(|id| id == action), "{action} is in the menu");
                }
                assert!(ids.iter().any(|id| id == "sidebar-new"));
                let saved = shell.latest_state.lock().unwrap().clone();
                let restored = Workspace::restore(Some(&saved), &[], "/work/molfar");
                assert!(!restored.sidebar_home_visible);
                assert!(!restored.sidebar_board_visible);
                assert!(!restored.sidebar_knowledge_visible);
            })
            .unwrap();
    }
}

#[test]
fn older_workspaces_show_every_destination() {
    let mut saved: serde_json::Value = serde_json::to_value(Workspace::default()).unwrap();
    let object = saved.as_object_mut().unwrap();
    for key in [
        "sidebar_home_visible",
        "sidebar_new_visible",
        "sidebar_board_visible",
        "sidebar_knowledge_visible",
    ] {
        assert!(object.remove(key).is_some(), "{key} is serialized");
    }
    let restored = Workspace::restore(Some(&saved.to_string()), &[], "/work/molfar");
    assert!(restored.sidebar_home_visible);
    assert!(restored.sidebar_new_visible);
    assert!(restored.sidebar_board_visible);
    assert!(restored.sidebar_knowledge_visible);
}
