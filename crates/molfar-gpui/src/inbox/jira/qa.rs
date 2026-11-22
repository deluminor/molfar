use std::{path::Path, sync::Arc};

use gpui::{
    AppContext, Context, Entity, HeadlessAppContext, IntoElement, Render, Window, div, prelude::*,
    px, size,
};
use molfar_core::jira::{
    Issue, ListModel, Row,
    issue::{Comment, Linked},
};

use super::{JiraList, JiraReader};
use crate::{assets::Assets, theme::*};

struct Host {
    list: Entity<JiraList>,
    reader: Entity<JiraReader>,
}

impl Render for Host {
    fn render(&mut self, _: &mut Window, _: &mut Context<Self>) -> impl IntoElement {
        div()
            .size_full()
            .flex()
            .bg(background_base())
            .text_color(content(1.))
            .child(
                div()
                    .w(px(380.))
                    .h_full()
                    .border_r_1()
                    .border_color(content(0.07))
                    .child(self.list.clone()),
            )
            .child(div().flex_1().h_full().child(self.reader.clone()))
    }
}

fn row(key: &str, parent: &str, kind: &str, summary: &str, status: &str, category: &str) -> Row {
    Row {
        key: key.into(),
        parent_key: parent.into(),
        type_name: kind.into(),
        summary: summary.into(),
        status: status.into(),
        status_category: category.into(),
        priority: "High".into(),
        assignee: "Erik K".into(),
        sprint: "Sprint 42".into(),
        updated: "2026-11-22T14:39:20.882+0200".into(),
        ..Row::default()
    }
}

#[test]
#[ignore = "writes screenshots: cargo test -p molfar-gpui write_jira_qa_screenshots -- --ignored"]
fn write_jira_qa_screenshots() {
    let dir =
        Path::new(env!("CARGO_MANIFEST_DIR")).join("../../docs/specs/inbox-atlassian-polish/qa");
    std::fs::create_dir_all(&dir).unwrap();
    let mut cx = HeadlessAppContext::with_platform(
        Arc::new(gpui_apple::AppleTextSystem::new()),
        Arc::new(Assets),
        || {
            Ok(Some(Box::new(
                gpui_apple::metal_renderer::MetalHeadlessRenderer::new(),
            )))
        },
    );
    cx.update(|cx| {
        cx.set_reduce_motion(true);
        crate::input::bind(cx);
        crate::popover::bind(cx);
    });
    let window = cx
        .open_window(size(px(1200.), px(760.)), |_, cx| {
            cx.new(|cx| Host {
                list: cx.new(|cx| JiraList::new(std::env::temp_dir(), cx)),
                reader: cx.new(|cx| JiraReader::new(std::env::temp_dir(), cx)),
            })
        })
        .unwrap();
    window
        .update(&mut cx, |host, _, cx| {
            host.list.update(cx, |list, _| {
                list.show_model(ListModel {
                    rows: vec![
                        row("TB-101", "", "Story", "Signal generation pipeline for stage one backtests", "In Progress", "indeterminate"),
                        row("TB-102", "TB-101", "Sub-task", "Wire the minimum balance protection check", "To Do", "new"),
                        row("TB-103", "TB-101", "Sub-task", "Add MINI backtest for stage 1, 2, 3 and 4", "Done", "done"),
                        row("TB-110", "", "Bug", "Overlapping titles in the Confluence tree", "In Review", "indeterminate"),
                        row("TB-111", "", "Task", "Document the release checklist", "To Do", "new"),
                        row("TB-120", "", "Epic", "Atlassian in Inbox", "Done", "done"),
                    ],
                    next: Some("page-2".into()),
                    ..ListModel::default()
                });
            });
            host.reader.update(cx, |reader, cx| {
                reader.show_issue(
                    Issue {
                        key: "TB-101".into(),
                        type_name: "Story".into(),
                        summary: "Signal generation pipeline for stage one backtests".into(),
                        status: "In Progress".into(),
                        priority: "High".into(),
                        assignee: "Erik K".into(),
                        reporter: "Ada Lovelace".into(),
                        sprint: "Sprint 42".into(),
                        labels: vec!["backtest".into(), "signals".into()],
                        created: "2026-11-18T10:00:00.000+0200".into(),
                        updated: "2026-11-22T14:39:20.882+0200".into(),
                        description: "## Goal\n\nGenerate entry signals for **stage one** and feed the backtester.\n\n- Read candles\n- Score signals\n- Emit orders\n".into(),
                        subtasks: vec![
                            Linked { key: "TB-102".into(), summary: "Wire the minimum balance protection check".into(), status: "To Do".into(), relation: String::new() },
                            Linked { key: "TB-103".into(), summary: "Add MINI backtest for stage 1, 2, 3 and 4".into(), status: "Done".into(), relation: String::new() },
                        ],
                        comments: vec![Comment {
                            id: "1".into(),
                            author: "Ada Lovelace".into(),
                            created: "2026-11-21T09:00:00.000+0200".into(),
                            body: "Looks good. Please add the drawdown chart.".into(),
                        }],
                        ..Issue::default()
                    },
                    cx,
                );
            });
            cx.notify();
        })
        .unwrap();
    window.update(&mut cx, |_, window, _| window.refresh()).ok();
    cx.run_until_parked();
    let image = cx
        .capture_screenshot(window.into())
        .expect("render screenshot");
    image.save(dir.join("jira.png")).expect("write screenshot");
}
