use super::{super::*, fixtures::*};
use gpui::TestAppContext;
use molfar_core::task_board::stage::lifecycle::types::StageAction;

#[gpui::test]
fn grill_uses_real_native_turn_and_settles_once_after_board_closes(cx: &mut TestAppContext) {
    let fixture = Fixture::new();
    let before =
        molfar_core::task_board::stage::checkout::snapshot(std::path::Path::new(&fixture.project))
            .unwrap();
    let window = fixture.window(cx);
    window
        .update(cx, |shell, window, cx| {
            shell.open_board(window, cx);
            shell.board_action(
                "card".into(),
                fixture.card().updated_at,
                StageAction::Start,
                cx,
            );
            shell.close_app_view(window, cx);
            shell.board = None;
            shell.app_view_events.clear();
        })
        .unwrap();
    wait_until(cx, || {
        fixture.card().column_id == "plan_approval" || fixture.card().run_state == "failed"
    });
    let card = fixture.card();
    assert_eq!(
        card.column_id, "plan_approval",
        "{}: {:?}",
        card.run_state, card.last_error
    );
    let session = *locked(&fixture.store)
        .unwrap()
        .board_owned_session_ids()
        .unwrap()
        .iter()
        .next()
        .unwrap();
    window
        .update(cx, |shell, _, cx| {
            assert!(shell.board.is_none());
            assert!(shell.sessions.contains_key(&session));
            assert!(!shell.board_state.running.contains_key(&session));
            assert!(shell.board_state.owned.contains(&session));
            assert!(shell.order.contains(&session));
            assert!(!shell.sidebar_hidden_sessions.contains(&session));
            assert!(shell.familiar_session_entity(session).is_none());
            assert!(shell.familiar_ensure_session(session, cx).is_none());
            assert!(
                !shell
                    .familiar_session_views(cx)
                    .iter()
                    .any(|view| view.id == session)
            );
            shell.poll_board(true, cx);
        })
        .unwrap();
    cx.run_until_parked();
    let snapshot = locked(&fixture.store)
        .unwrap()
        .board_snapshot(None, false, Some("card"))
        .unwrap();
    assert_eq!(snapshot.runs.len(), 1);
    assert_eq!(snapshot.runs[0].dispatch, "settled");
    assert_eq!(snapshot.runs[0].status, "succeeded");
    assert_eq!(snapshot.artifacts.len(), 3);
    assert_eq!(
        std::fs::read_to_string(fixture.root.join("submissions"))
            .unwrap()
            .lines()
            .count(),
        1
    );
    assert_eq!(
        before,
        molfar_core::task_board::stage::checkout::snapshot(std::path::Path::new(&fixture.project))
            .unwrap()
    );
}
