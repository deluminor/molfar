use super::super::Board;
use crate::modal::{self, sheet};
use crate::task_board::controls;
use gpui::{AnyElement, ClipboardItem, Context, Role, Window, div, prelude::*, px};

impl Board {
    pub(in crate::task_board) fn artifact_overlay(
        &self,
        window: &Window,
        cx: &mut Context<Self>,
    ) -> Option<AnyElement> {
        let artifact = self.artifact.as_ref()?;
        let body = artifact.text.clone();
        let card = sheet::sheet(760.)
            .bg(crate::theme::floating_fill())
            .max_h((window.viewport_size().height - px(40.)).max(px(160.)))
            .id("board-artifact-dialog")
            .debug_selector(|| "board-artifact-dialog".into())
            .role(Role::Dialog)
            .aria_label(artifact.title.clone())
            .track_focus(&artifact.focus)
            .on_key_down(cx.listener(|this, event: &gpui::KeyDownEvent, window, cx| {
                if event.keystroke.key == "escape" {
                    this.close_artifact(window, cx);
                }
                cx.stop_propagation();
            }))
            .child(
                sheet::header(artifact.title.clone(), None).child(
                    sheet::close_button("board-artifact-dismiss").on_click(
                        cx.listener(|this, _, window, cx| this.close_artifact(window, cx)),
                    ),
                ),
            )
            .child(
                sheet::body("board-artifact-body")
                    .when(
                        artifact.preview.is_none() && artifact.error.is_none(),
                        |d| d.child("Loading artifact…"),
                    )
                    .when_some(artifact.error.clone(), |d, error| {
                        d.child(
                            div()
                                .id("board-artifact-error")
                                .role(Role::Alert)
                                .child(error),
                        )
                    })
                    .when_some(artifact.preview.clone(), |d, preview| d.child(preview)),
            )
            .child(
                sheet::footer()
                    .when_some(body, |d, body| {
                        d.child(
                            controls::ghost_button("board-artifact-copy", "Copy Markdown")
                                .on_click(move |_, _, cx| {
                                    cx.write_to_clipboard(ClipboardItem::new_string(body.clone()))
                                }),
                        )
                    })
                    .child(
                        controls::primary_button("board-artifact-close", "Close").on_click(
                            cx.listener(|this, _, window, cx| this.close_artifact(window, cx)),
                        ),
                    ),
            );
        let weak = cx.weak_entity();
        Some(
            modal::window_overlay(
                window,
                modal::overlay("board-artifact", card, move |window, cx| {
                    let _ = weak.update(cx, |this, cx| this.close_artifact(window, cx));
                }),
            )
            .into_any_element(),
        )
    }
}
