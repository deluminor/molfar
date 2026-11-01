use super::super::Board;
use crate::modal;
use gpui::{AnyElement, ClipboardItem, Context, Role, Window, div, prelude::*, px};

impl Board {
    pub(in crate::task_board) fn artifact_overlay(
        &self,
        window: &Window,
        cx: &mut Context<Self>,
    ) -> Option<AnyElement> {
        let artifact = self.artifact.as_ref()?;
        let body = artifact.text.clone();
        let card = modal::card()
            .w(px(760.))
            .max_w_full()
            .max_h(window.viewport_size().height - px(40.))
            .id("board-artifact-dialog")
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
                modal::card_body()
                    .gap_3()
                    .child(modal::title(artifact.title.clone()))
                    .child(
                        div()
                            .id("board-artifact-body")
                            .max_h((window.viewport_size().height - px(180.)).max(px(100.)))
                            .overflow_y_scroll()
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
                        modal::actions()
                            .when_some(body, |d, body| {
                                d.child(
                                    modal::ghost_button("board-artifact-copy", "Copy Markdown")
                                        .on_click(move |_, _, cx| {
                                            cx.write_to_clipboard(ClipboardItem::new_string(
                                                body.clone(),
                                            ))
                                        }),
                                )
                            })
                            .child(
                                modal::primary_button("board-artifact-close", "Close").on_click(
                                    cx.listener(|this, _, window, cx| {
                                        this.close_artifact(window, cx)
                                    }),
                                ),
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
