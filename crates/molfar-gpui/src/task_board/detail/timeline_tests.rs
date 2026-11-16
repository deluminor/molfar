use super::tests::show;
use crate::task_board::{Event, settings::tests::click};
use gpui::{TestAppContext, VisualTestContext};
use molfar_core::task_board::{
    constants::GRILL, stage::lifecycle::constants::SUCCEEDED, types::StageRun,
};
use std::{cell::RefCell, rc::Rc};

fn run(id: &str, session: Option<&str>, attempt: i64) -> StageRun {
    StageRun {
        id: id.into(),
        card_id: "first".into(),
        stage: GRILL.into(),
        attempt,
        session_id: session.map(str::to_owned),
        harness: "codex".into(),
        model: "codex:gpt-5".into(),
        settings_json: "{}".into(),
        runtime_mode: "auto".into(),
        template_version: 1,
        dispatch: "test".into(),
        status: SUCCEEDED.into(),
        error: None,
        head_before: None,
        porcelain_before: None,
        fingerprint_before: None,
        head_after: None,
        started_at: 1000,
        completed_at: Some(61000),
    }
}

#[gpui::test]
fn timeline_opens_the_selected_attempt_session_and_omits_missing_links(cx: &mut TestAppContext) {
    let window = show(cx, false);
    let seen: Rc<RefCell<Vec<String>>> = Rc::default();
    let events = seen.clone();
    let board = window.update(cx, |_, _, cx| cx.entity()).unwrap();
    cx.update(|cx| {
        cx.subscribe(&board, move |_, event: &Event, _| {
            if let Event::OpenSession(session) = event {
                events.borrow_mut().push(session.clone());
            }
        })
        .detach()
    });
    window
        .update(cx, |board, _, cx| {
            board.snapshot.as_mut().unwrap().runs = vec![
                run("one", Some("session-one"), 1),
                run("two", Some("session-two"), 2),
                run("none", None, 3),
            ];
            cx.notify();
        })
        .unwrap();
    let visual = &mut VisualTestContext::from_window(window.into(), cx);
    visual.run_until_parked();
    assert!(visual.debug_bounds("board-run-open-none").is_none());
    click(visual, "board-run-open-two");
    visual.run_until_parked();
    assert_eq!(*seen.borrow(), vec!["session-two".to_owned()]);
}
