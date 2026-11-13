use super::super::tests::window;
use super::tests::{record, seed};
use gpui::{TestAppContext, VisualTestContext};

#[gpui::test]
fn verify_command_saves_for_the_board_project_and_clears_when_empty(cx: &mut TestAppContext) {
    let window = window(cx);
    let events = record(&window, cx);
    seed(&window, cx);
    let visual = &mut VisualTestContext::from_window(window.into(), cx);
    visual.run_until_parked();
    assert!(visual.debug_bounds("board-settings-verify-save").is_some());

    let save = |command: &str, visual: &mut VisualTestContext| {
        let command = command.to_owned();
        window
            .update(visual, |board, _, cx| {
                let panel = board.settings.as_ref().unwrap();
                panel
                    .verify
                    .update(cx, |input, cx| input.set_text(command, cx));
                board.save_verify_command(cx);
            })
            .unwrap();
        visual.run_until_parked();
    };
    let project = window
        .update(visual, |board, _, _| {
            board.settings.as_ref().unwrap().project.clone()
        })
        .unwrap();

    save("  npm run check:web ", visual);
    save("", visual);

    assert_eq!(
        *events.borrow(),
        [
            format!(
                "VerifyCommand {{ project: {project:?}, command: Some(\"npm run check:web\") }}"
            ),
            format!("VerifyCommand {{ project: {project:?}, command: None }}"),
        ]
    );
}
