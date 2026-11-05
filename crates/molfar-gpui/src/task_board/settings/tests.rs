use super::super::{
    Board, Event,
    tests::{card, window},
};
use gpui::{TestAppContext, VisualTestContext, WindowHandle};
use molfar_core::task_board::stage::{
    agent::AgentStage,
    choice::settings::{SettingsPatch, StageModelConfig},
};
use molfar_core::task_board::types::Snapshot;
use std::{cell::RefCell, rc::Rc};

type Events = Rc<RefCell<Vec<String>>>;

pub(in crate::task_board) fn record(
    window: &WindowHandle<Board>,
    cx: &mut TestAppContext,
) -> Events {
    let events: Events = Rc::default();
    let board = window.update(cx, |_, _, cx| cx.entity()).unwrap();
    let recorded = events.clone();
    cx.update(|cx| {
        cx.subscribe(&board, move |_, event: &Event, _| {
            let text = match event {
                Event::Settings(patch) => format!("{patch:?}"),
                Event::Stage { action, .. } => format!("{action:?}"),
                Event::Deliver { method, .. } => format!("Deliver({method:?})"),
                Event::Reject { .. } => "Reject".into(),
                Event::OpenSession(_) | Event::Close => return,
            };
            recorded.borrow_mut().push(text);
        })
        .detach();
    });
    events
}

pub(super) fn seed(window: &WindowHandle<Board>, cx: &mut TestAppContext) {
    let config = StageModelConfig {
        harness: "codex".into(),
        model: "codex:gpt-5".into(),
        effort: None,
        runtime_mode: "auto".into(),
    };
    window
        .update(cx, |board, window, cx| {
            let mut store = crate::runtime::locked(&board.store).unwrap();
            store
                .board_update_settings(&SettingsPatch::Column(AgentStage::Grill, Some(config)))
                .unwrap();
            store
                .board_update_settings(&SettingsPatch::ColumnSkills(
                    AgentStage::Grill,
                    Some(vec!["d-plan".into()]),
                ))
                .unwrap();
            drop(store);
            board.open_settings(window, cx);
        })
        .unwrap();
}

pub(in crate::task_board) fn click(visual: &mut VisualTestContext, selector: &'static str) {
    let bounds = visual
        .debug_bounds(selector)
        .unwrap_or_else(|| panic!("{selector}"));
    visual.simulate_click(bounds.center(), Default::default());
    visual.run_until_parked();
}

#[gpui::test]
fn stage_settings_show_saved_values_and_emit_field_patches(cx: &mut TestAppContext) {
    let window = window(cx);
    let events = record(&window, cx);
    seed(&window, cx);
    let visual = &mut VisualTestContext::from_window(window.into(), cx);
    visual.run_until_parked();

    window
        .update(visual, |board, _, cx| {
            let panel = board.settings.as_ref().unwrap();
            assert_eq!(panel.skills[0].1.read(cx).content.as_ref(), "d-plan");
            assert_eq!(panel.concurrency.read(cx).content.as_ref(), "3");
        })
        .unwrap();
    click(visual, "board-settings-grill-mode-supervised");
    click(visual, "board-settings-implement-mode-supervised");
    window
        .update(visual, |board, _, cx| {
            let input = board.settings.as_ref().unwrap().skills[1].1.clone();
            input.update(cx, |input, cx| input.set_text("d-tdd, d-verify".into(), cx));
        })
        .unwrap();
    click(visual, "board-settings-implement-skills-save");
    click(visual, "board-settings-grill-skills-auto");

    let events = events.borrow();
    assert_eq!(events.len(), 3, "{events:?}");
    assert_eq!(events[0], r#"ColumnMode(Grill, "supervised")"#);
    assert_eq!(
        events[1],
        r#"ColumnSkills(Implement, Some(["d-tdd", "d-verify"]))"#
    );
    assert_eq!(events[2], "ColumnSkills(Grill, None)");
}

#[gpui::test]
fn empty_skills_mean_auto_and_reloads_keep_unsaved_fields(cx: &mut TestAppContext) {
    let window = window(cx);
    let events = record(&window, cx);
    seed(&window, cx);
    let visual = &mut VisualTestContext::from_window(window.into(), cx);
    visual.run_until_parked();

    window
        .update(visual, |board, _, cx| {
            let panel = board.settings.as_ref().unwrap();
            panel.skills[0]
                .1
                .update(cx, |input, cx| input.set_text(String::new(), cx));
            panel.skills[1]
                .1
                .update(cx, |input, cx| input.set_text("unsaved".into(), cx));
            board.save_stage_skills(AgentStage::Grill, cx);
            board.finish_settings_update(None, cx);
        })
        .unwrap();
    visual.run_until_parked();

    assert_eq!(*events.borrow(), ["ColumnSkills(Grill, None)"]);
    window
        .update(visual, |board, _, cx| {
            let panel = board.settings.as_ref().unwrap();
            assert_eq!(panel.skills[1].1.read(cx).content.as_ref(), "unsaved");
            assert!(panel.error.is_none());
        })
        .unwrap();
}

#[gpui::test]
fn invalid_limits_stay_local_and_valid_limits_emit_once(cx: &mut TestAppContext) {
    let window = window(cx);
    let events = record(&window, cx);
    seed(&window, cx);
    let visual = &mut VisualTestContext::from_window(window.into(), cx);
    visual.run_until_parked();

    let save = |stall: &str, visual: &mut VisualTestContext| {
        let stall = stall.to_owned();
        window
            .update(visual, |board, _, cx| {
                let panel = board.settings.as_ref().unwrap();
                panel
                    .stall
                    .update(cx, |input, cx| input.set_text(stall, cx));
                board.save_limits(cx);
            })
            .unwrap();
        visual.run_until_parked();
    };

    save("soon", visual);
    window
        .update(visual, |board, _, _| {
            assert!(board.settings.as_ref().unwrap().error.is_some())
        })
        .unwrap();
    assert!(visual.debug_bounds("board-settings-error").is_some());
    assert!(events.borrow().is_empty());
    save("60", visual);

    assert_eq!(
        *events.borrow(),
        ["Limits { max_concurrent: 3, stall_minutes: 60 }"]
    );
}

#[gpui::test]
fn failed_stage_offers_back_to_its_source_column(cx: &mut TestAppContext) {
    let window = window(cx);
    let events = record(&window, cx);
    let mut failed = card("card", "implement");
    failed.run_state = "failed".into();
    window
        .update(cx, |board, _, cx| {
            let snapshot = Snapshot {
                cards: vec![failed],
                selected: Some("card".into()),
                ..Default::default()
            };
            board.drawer_open = true;
            board.finish(board.revision, Ok(snapshot), cx);
        })
        .unwrap();
    let visual = &mut VisualTestContext::from_window(window.into(), cx);
    visual.run_until_parked();

    assert!(visual.debug_bounds("board-stage-action").is_some());
    assert!(visual.debug_bounds("board-retry-model").is_some());
    click(visual, "board-stage-back");

    assert_eq!(*events.borrow(), ["Back"]);
}

#[gpui::test]
fn first_failed_review_keeps_retry_and_hides_unusable_final_review_back(cx: &mut TestAppContext) {
    let window = window(cx);
    let mut failed = card("card", "code_review");
    failed.run_state = "failed".into();
    window
        .update(cx, |board, _, cx| {
            board.drawer_open = true;
            board.finish(
                board.revision,
                Ok(Snapshot {
                    cards: vec![failed],
                    selected: Some("card".into()),
                    ..Default::default()
                }),
                cx,
            );
        })
        .unwrap();
    let visual = &mut VisualTestContext::from_window(window.into(), cx);
    visual.run_until_parked();
    assert!(visual.debug_bounds("board-stage-action").is_some());
    assert!(visual.debug_bounds("board-retry-model").is_some());
    assert!(visual.debug_bounds("board-stage-back").is_none());
}
