use std::path::PathBuf;

use gpui::{AppContext, TestAppContext, VisualTestContext, WindowOptions, px};
use molfar_core::jira::{self, GroupBy, ListModel, Row};

use super::JiraList;
use crate::inbox::jira::rows::Entry;

#[gpui::test]
fn invalid_jql_keeps_rows_and_groups_name_missing_epic(cx: &mut TestAppContext) {
    cx.update(|cx| {
        let list = cx.new(|cx| JiraList::new(PathBuf::from("/tmp/jira-list"), cx));
        list.update(cx, |list, cx| {
            list.show_model(ListModel {
                rows: vec![
                    Row {
                        key: "TB-1".into(),
                        epic_key: "EP-1".into(),
                        epic_summary: "Epic".into(),
                        status: "Open".into(),
                        ..Row::default()
                    },
                    Row {
                        key: "TB-2".into(),
                        ..Row::default()
                    },
                ],
                ..ListModel::default()
            });
            list.reject_jql("Expected operator".into());
            assert_eq!(list.model().rows.len(), 2);
            assert_eq!(list.model().error.as_deref(), Some("Expected operator"));
            let titles: Vec<_> = jira::groups(&list.model().rows, GroupBy::Epic)
                .into_iter()
                .map(|group| group.title)
                .collect();
            assert_eq!(titles, ["EP-1 Epic", "No epic"]);

            list.set_grouping(Some(GroupBy::Epic), cx);
            assert!(matches!(list.entries[0], Entry::Group { .. }));
            assert_eq!(list.list.item_count(), list.entries.len());

            list.model.more = Some("past-cap".into());
            list.load_more(cx);
            assert!(!list.loading);
            list.model.next = Some("page-2".into());
            list.load_more(cx);
            assert!(list.loading);
        });
    });
}

#[gpui::test]
fn only_visible_issue_rows_are_built(cx: &mut TestAppContext) {
    let window = cx.update(|cx| {
        cx.open_window(WindowOptions::default(), |_, cx| {
            cx.new(|cx| JiraList::new(PathBuf::from("/tmp/jira-list-virtual"), cx))
        })
        .unwrap()
    });
    let visual = &mut VisualTestContext::from_window(window.into(), cx);
    window
        .update(visual, |list, _, cx| {
            list.show_model(ListModel {
                rows: (0..400)
                    .map(|index| Row {
                        key: format!("TB-{index}"),
                        summary: "A very long summary that must stay on a single line in the row"
                            .into(),
                        status: "In Progress".into(),
                        ..Row::default()
                    })
                    .collect(),
                ..ListModel::default()
            });
            cx.notify();
        })
        .unwrap();
    visual.run_until_parked();

    assert!(visual.debug_bounds("jira-row-TB-0").is_some());
    assert!(visual.debug_bounds("jira-row-TB-399").is_none());
    let first = visual.debug_bounds("jira-row-TB-0").unwrap();
    let second = visual.debug_bounds("jira-row-TB-1").unwrap();
    assert!(second.top() >= first.bottom(), "rows never overlap");
    let summary = visual.debug_bounds("jira-summary-TB-0").unwrap();
    let metadata = visual.debug_bounds("jira-metadata-TB-0").unwrap();
    assert!(metadata.top() - summary.bottom() >= px(3.));
    assert!(summary.size.height <= px(18.));
    assert!(metadata.bottom() <= first.bottom());
}
