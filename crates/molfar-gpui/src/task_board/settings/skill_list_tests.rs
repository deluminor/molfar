use super::{
    super::{Board, tests::window},
    tests::{click, record, seed},
};
use gpui::{TestAppContext, VisualTestContext, WindowHandle, px};
use molfar_core::task_board::stage::agent::AgentStage;

fn open_grill(window: &WindowHandle<Board>, cx: &mut TestAppContext) -> VisualTestContext {
    window
        .update(cx, |board, _, cx| {
            board.finish(board.revision, Ok(Default::default()), cx);
        })
        .unwrap();
    seed(window, cx);
    let mut visual = VisualTestContext::from_window((*window).into(), cx);
    visual.run_until_parked();
    window
        .update(&mut visual, |board, window, cx| {
            board.open_column_settings(AgentStage::Grill, window, cx);
        })
        .unwrap();
    visual.run_until_parked();
    window
        .update(&mut visual, |board, _, cx| {
            let focus = board.settings.as_ref().unwrap().focus.clone();
            let catalog = ["caveman", "d-plan", "d-verify"].map(String::from).to_vec();
            board.finish_column_skills(AgentStage::Grill, &focus, Ok(catalog), cx);
        })
        .unwrap();
    visual.run_until_parked();
    visual
}

#[gpui::test]
fn model_picker_opens_under_its_trigger_inside_the_settings(cx: &mut TestAppContext) {
    let window = window(cx);
    let visual = &mut open_grill(&window, cx);

    click(visual, "board-column-settings-model");

    let trigger = visual.debug_bounds("board-column-settings-model").unwrap();
    let settings = visual.debug_bounds("board-column-settings").unwrap();
    let picker = visual.debug_bounds("board-picker-content").unwrap();
    assert!(picker.top() >= trigger.bottom(), "{picker:?} {trigger:?}");
    assert!(
        picker.top() <= trigger.bottom() + px(16.),
        "{picker:?} {trigger:?}"
    );
    assert!(picker.top() < settings.bottom(), "{picker:?} {settings:?}");
}

#[gpui::test]
fn only_added_skills_show_until_add_opens_the_rest(cx: &mut TestAppContext) {
    let window = window(cx);
    let events = record(&window, cx);
    let visual = &mut open_grill(&window, cx);

    assert!(
        visual
            .debug_bounds("board-column-skill-remove-d-plan")
            .is_some()
    );
    assert!(visual.debug_bounds("board-column-skill-d-verify").is_none());
    assert!(
        visual
            .debug_bounds("board-column-skills-available")
            .is_none()
    );

    click(visual, "board-column-skills-add");
    assert!(visual.debug_bounds("board-column-skill-d-verify").is_some());
    assert!(visual.debug_bounds("board-column-skill-caveman").is_some());
    assert!(visual.debug_bounds("board-column-skill-d-plan").is_none());

    visual.simulate_input("cave");
    visual.run_until_parked();
    assert!(visual.debug_bounds("board-column-skill-d-verify").is_none());
    click(visual, "board-column-skill-caveman");
    assert_eq!(
        *events.borrow(),
        ["ColumnSkills(Grill, Some([\"d-plan\", \"caveman\"]))"]
    );

    visual.simulate_keystrokes("escape");
    visual.run_until_parked();
    window
        .update(visual, |board, _, _| {
            let panel = board.settings.as_ref().unwrap();
            assert!(!panel.adding_skills);
            assert_eq!(panel.column, Some(AgentStage::Grill));
        })
        .unwrap();
    assert!(visual.debug_bounds("board-column-skills-add").is_some());
}

#[gpui::test]
fn removing_the_last_added_skill_keeps_an_empty_custom_list(cx: &mut TestAppContext) {
    let window = window(cx);
    let events = record(&window, cx);
    let visual = &mut open_grill(&window, cx);

    click(visual, "board-column-skill-remove-d-plan");

    assert_eq!(*events.borrow(), ["ColumnSkills(Grill, Some([]))"]);
}
