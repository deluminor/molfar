use super::super::{
    Board, Event,
    tests::{card, window},
};
use super::actions::stage_action;
use gpui::{TestAppContext, VisualTestContext};
use molfar_core::task_board::{
    stage::lifecycle::types::StageAction,
    types::{Snapshot, StageRun},
};
use std::{cell::RefCell, rc::Rc};

fn run(card_id: &str, session_id: &str) -> StageRun {
    StageRun {
        id: "run".into(),
        card_id: card_id.into(),
        stage: "grill".into(),
        attempt: 1,
        session_id: Some(session_id.into()),
        harness: "codex".into(),
        model: "gpt-test".into(),
        settings_json: "{}".into(),
        runtime_mode: "auto".into(),
        template_version: 3,
        dispatch: "submitted".into(),
        status: "running".into(),
        error: None,
        head_before: None,
        porcelain_before: None,
        fingerprint_before: None,
        head_after: None,
        started_at: 1,
        completed_at: None,
    }
}

#[test]
fn stage_controls_follow_card_state() {
    let mut start = card("start", "backlog");
    start.run_state = "idle".into();
    let mut retry = card("retry", "grill");
    retry.run_state = "failed".into();
    let mut queued = card("queued", "grill");
    queued.run_state = "queued".into();
    let running = card("running", "grill");
    let mut archived = start.clone();
    archived.archived = true;

    assert_eq!(
        stage_action(&start),
        Some(("Start Grill", StageAction::Start))
    );
    assert_eq!(
        stage_action(&retry),
        Some(("Retry Grill", StageAction::Retry(None)))
    );
    assert_eq!(
        stage_action(&queued),
        Some(("Cancel run", StageAction::Cancel))
    );
    assert_eq!(
        stage_action(&running),
        Some(("Cancel run", StageAction::Cancel))
    );
    assert_eq!(stage_action(&archived), None);
    assert_eq!(stage_action(&card("approval", "plan_approval")), None);
}

#[gpui::test]
fn stage_action_emits_once_until_finished_and_opens_saved_session(cx: &mut TestAppContext) {
    let window = window(cx);
    let events = Rc::new(RefCell::new(Vec::new()));
    let board = window.update(cx, |_, _, cx| cx.entity()).unwrap();
    let recorded = events.clone();
    cx.update(|cx| {
        cx.subscribe(&board, move |_, event: &Event, _| match event {
            Event::Stage {
                card_id,
                updated_at,
                action,
            } => recorded
                .borrow_mut()
                .push(format!("stage:{card_id}:{updated_at}:{action:?}")),
            Event::OpenSession(id) => recorded.borrow_mut().push(format!("open:{id}")),
            Event::Close => recorded.borrow_mut().push("close".into()),
        })
        .detach();
    });
    let mut start = card("card", "backlog");
    start.run_state = "idle".into();
    window
        .update(cx, |board, _, cx| {
            let snapshot = Snapshot {
                cards: vec![start],
                runs: vec![run("card", "board-run")],
                selected: Some("card".into()),
                ..Default::default()
            };
            board.finish(board.revision, Ok(snapshot), cx);
        })
        .unwrap();
    let visual = &mut VisualTestContext::from_window(window.into(), cx);
    visual.run_until_parked();

    let action = visual
        .debug_bounds("board-stage-action")
        .expect("stage action");
    visual.simulate_click(action.center(), Default::default());
    visual.run_until_parked();
    visual.simulate_click(action.center(), Default::default());
    visual.run_until_parked();
    let open = visual
        .debug_bounds("board-open-stage-session")
        .expect("open session");
    visual.simulate_click(open.center(), Default::default());
    visual.run_until_parked();

    assert_eq!(
        *events.borrow(),
        vec!["stage:card:2:Start".to_owned(), "open:board-run".to_owned()]
    );
    window
        .update(visual, |board: &mut Board, _, cx| {
            assert_eq!(board.stage_pending.as_deref(), Some("card"));
            board.finish_stage_action(Some("Card changed".into()), cx);
            assert!(board.stage_pending.is_none());
            assert_eq!(board.error.as_deref(), Some("Card changed"));
        })
        .unwrap();
}
