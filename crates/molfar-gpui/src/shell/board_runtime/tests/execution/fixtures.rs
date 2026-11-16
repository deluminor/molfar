use super::super::{super::*, fixtures::*};
use gpui::{TestAppContext, WindowHandle};
use molfar_core::task_board::stage::lifecycle::types::StageAction;

pub(super) fn action(
    fixture: &Fixture,
    window: WindowHandle<Shell>,
    action: StageAction,
    cx: &mut TestAppContext,
) {
    window
        .update(cx, |shell, _, cx| {
            shell.board_action("card".into(), fixture.card().updated_at, action, cx)
        })
        .unwrap();
}

pub(super) fn gate(fixture: &Fixture, column: &str, cx: &mut TestAppContext) {
    wait_until(cx, || {
        let card = fixture.card();
        card.run_state == "failed" || (card.column_id == column && card.run_state == "idle")
    });
    let card = fixture.card();
    assert_eq!(
        card.column_id, column,
        "{}: {:?}",
        card.run_state, card.last_error
    );
    assert_eq!(card.run_state, "idle", "{:?}", card.last_error);
}

pub(super) fn start(fixture: &Fixture, cx: &mut TestAppContext) -> WindowHandle<Shell> {
    let window = fixture.window(cx);
    action(fixture, window, StageAction::Start, cx);
    gate(fixture, "plan_approval", cx);
    window
}
