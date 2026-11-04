use super::Board;
use crate::popover::{Anchor, menu_popover};
use crate::task_board::controls;
use crate::{modal, theme::*};
use gpui::{AnyElement, Context, Role, Window, div, prelude::*, px};

impl Board {
    pub(in crate::task_board) fn creation_overlay(
        &self,
        window: &Window,
        cx: &mut Context<Self>,
    ) -> Option<AnyElement> {
        if !self.create_open {
            return None;
        }
        let draft = self.creation.as_ref()?;
        let busy = draft.busy;
        let submit = if busy {
            "Creating…"
        } else if draft.error.is_some() {
            "Retry creation"
        } else {
            "Create card"
        };
        let project = if draft.project.is_empty() {
            "Choose a local project".to_owned()
        } else {
            draft.project.clone()
        };
        let project_menu = draft.project_menu.as_ref().map(|menu| {
            menu_popover(menu, Anchor::Slot(draft.project_anchor.clone()), cx).into_any_element()
        });
        let card =
            modal::card()
                .bg(crate::theme::floating_fill())
                .w(px(520.))
                .max_w_full()
                .max_h_full()
                .id("board-create-dialog")
                .debug_selector(|| "board-create-dialog".into())
                .role(Role::Dialog)
                .aria_label("New task")
                .on_key_down(cx.listener(Self::create_key))
                .child(
                    modal::card_body()
                        .id("board-create-body")
                        .gap_3()
                        .max_h_full()
                        .overflow_y_scroll()
                        .child(modal::title("New task"))
                        .child(modal::body(
                            "Start in Backlog. Refine and run the task when you are ready.",
                        ))
                        .child(
                            div()
                                .text_size(px(12.))
                                .child(div().mb_1().text_color(content(0.65)).child("Project"))
                                .child(
                                    div()
                                        .id("board-create-project")
                                        .role(Role::ComboBox)
                                        .aria_label("Project")
                                        .aria_expanded(draft.project_menu.is_some())
                                        .track_focus(&draft.project_focus)
                                        .px_2()
                                        .py_2()
                                        .rounded_md()
                                        .border_1()
                                        .border_color(composer_border(
                                            draft.project_focus.is_focused(window),
                                        ))
                                        .bg(content(0.04))
                                        .flex()
                                        .items_center()
                                        .gap_2()
                                        .cursor_pointer()
                                        .child(draft.project_anchor.probe())
                                        .child(div().flex_1().min_w_0().truncate().child(project))
                                        .child(icon("chevron-down-hi", 14.))
                                        .on_click(cx.listener(|this, _, window, cx| {
                                            this.open_create_project(window, cx)
                                        })),
                                ),
                        )
                        .child(crate::input::form_field("Title", draft.title.clone(), 32.))
                        .child(crate::input::form_field(
                            "Description",
                            draft.description.clone(),
                            92.,
                        ))
                        .child(crate::input::form_field(
                            "Acceptance criteria (optional)",
                            draft.criteria.clone(),
                            70.,
                        ))
                        .child(crate::input::form_field(
                            "Base branch (optional)",
                            draft.base.clone(),
                            32.,
                        ))
                        .when_some(draft.error.clone(), |body, error| {
                            body.child(
                                div()
                                    .id("board-create-error")
                                    .debug_selector(|| "board-create-error".into())
                                    .role(Role::Alert)
                                    .text_size(px(12.))
                                    .child(error),
                            )
                        })
                        .child(
                            modal::actions()
                                .mt_1()
                                .child(
                                    modal::disabled(
                                        controls::ghost_button("board-create-cancel", "Cancel"),
                                        busy,
                                    )
                                    .track_focus(&draft.cancel_focus)
                                    .border_1()
                                    .border_color(content(0.))
                                    .focus_visible(|s| s.border_color(accent_color()))
                                    .on_click(cx.listener(
                                        |this, _, window, cx| this.close_create(window, cx),
                                    )),
                                )
                                .child(
                                    modal::disabled(
                                        controls::primary_button("board-create-submit", submit),
                                        busy,
                                    )
                                    .track_focus(&draft.submit_focus)
                                    .border_1()
                                    .border_color(content(0.))
                                    .focus_visible(|s| s.border_color(accent_color()))
                                    .on_click(cx.listener(|this, _, _, cx| this.submit_create(cx))),
                                ),
                        ),
                );
        let weak = cx.weak_entity();
        let overlay = div()
            .absolute()
            .inset_0()
            .child(modal::overlay("board-create", card, move |window, cx| {
                let _ = weak.update(cx, |this, cx| this.close_create(window, cx));
            }))
            .when_some(project_menu, |overlay, menu| overlay.child(menu));
        Some(modal::window_overlay(window, overlay).into_any_element())
    }
}
