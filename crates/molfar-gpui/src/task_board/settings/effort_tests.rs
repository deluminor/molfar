use super::{
    super::{Board, tests::window},
    tests::{click, record, seed},
};
use gpui::{TestAppContext, VisualTestContext, WindowHandle};
use molfar_core::{
    catalog::Model,
    provider::Kind,
    task_board::stage::{agent::AgentStage, choice::settings::SettingsPatch},
};
use serde_json::json;

fn gpt5() -> Model {
    Model {
        id: "gpt-5".into(),
        name: "GPT-5".into(),
        alias_target: None,
        efforts: vec!["low".into(), "high".into()],
        default_effort: Some("low".into()),
        fast: false,
        thinking: false,
        default: true,
        tiers: Vec::new(),
        controls: Vec::new(),
    }
}

fn open_grill(window: &WindowHandle<Board>, visual: &mut VisualTestContext, models: Vec<Model>) {
    window
        .update(visual, |board, window, cx| {
            board.finish(board.revision, Ok(Default::default()), cx);
            board.open_column_settings(AgentStage::Grill, window, cx);
        })
        .unwrap();
    visual.run_until_parked();
    window
        .update(visual, |board, _, cx| {
            board.settings.as_mut().unwrap().models = vec![(Kind::Codex, models)];
            cx.notify();
        })
        .unwrap();
    visual.run_until_parked();
}

#[gpui::test]
fn column_settings_offer_the_model_efforts_and_save_the_pick(cx: &mut TestAppContext) {
    let window = window(cx);
    let events = record(&window, cx);
    seed(&window, cx);
    let visual = &mut VisualTestContext::from_window(window.into(), cx);
    visual.run_until_parked();
    open_grill(&window, visual, vec![gpt5()]);

    assert!(visual.debug_bounds("board-column-grill-effort-").is_some());
    assert!(
        visual
            .debug_bounds("board-column-grill-effort-low")
            .is_some()
    );
    click(visual, "board-column-grill-effort-high");

    assert_eq!(*events.borrow(), [r#"ColumnEffort(Grill, Some("high"))"#]);
}

#[gpui::test]
fn saved_effort_stays_visible_before_the_catalog_loads_and_default_clears_it(
    cx: &mut TestAppContext,
) {
    let window = window(cx);
    let events = record(&window, cx);
    seed(&window, cx);
    window
        .update(cx, |board, _, _| {
            crate::runtime::locked(&board.store)
                .unwrap()
                .board_update_settings(&SettingsPatch::ColumnEffort(
                    AgentStage::Grill,
                    Some("xhigh".into()),
                ))
                .unwrap();
        })
        .unwrap();
    let visual = &mut VisualTestContext::from_window(window.into(), cx);
    visual.run_until_parked();
    open_grill(&window, visual, Vec::new());

    assert!(
        visual
            .debug_bounds("board-column-grill-effort-xhigh")
            .is_some()
    );
    click(visual, "board-column-grill-effort-xhigh");
    click(visual, "board-column-grill-effort-");

    assert_eq!(*events.borrow(), ["ColumnEffort(Grill, None)"]);
}

#[gpui::test]
fn columns_without_a_model_or_efforts_hide_the_effort_choice(cx: &mut TestAppContext) {
    let window = window(cx);
    seed(&window, cx);
    let visual = &mut VisualTestContext::from_window(window.into(), cx);
    visual.run_until_parked();
    open_grill(
        &window,
        visual,
        vec![Model {
            efforts: Vec::new(),
            default_effort: None,
            ..gpt5()
        }],
    );

    assert!(visual.debug_bounds("board-column-grill-effort-").is_none());
    window
        .update(visual, |board, window, cx| {
            board.open_column_settings(AgentStage::Implement, window, cx);
        })
        .unwrap();
    visual.run_until_parked();
    assert!(
        visual
            .debug_bounds("board-column-implement-effort-")
            .is_none()
    );
}

#[test]
fn column_label_appends_the_saved_effort() {
    let config = json!({"harness":"codex","model":"codex:gpt-5","runtimeMode":"auto"});
    let plain = crate::task_board::controls::column_label(&config);
    let mut with_effort = config;
    with_effort["effort"] = json!("high");

    assert_eq!(
        crate::task_board::controls::column_label(&with_effort),
        format!("{plain} · high")
    );
    assert!(!plain.contains('·'));
}
