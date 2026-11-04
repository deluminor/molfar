use super::{super::Board, PickTarget, modes, stage_label};
use crate::{
    modal,
    popover::{Anchor, popover},
    task_board::controls,
    theme::*,
};
use gpui::{AnyElement, Context, Role, Window, div, prelude::*, px};
use molfar_core::task_board::stage::{
    agent::AgentStage,
    choice::settings::{HARNESS, MODEL, RUNTIME_MODE},
};

impl Board {
    pub(in crate::task_board) fn open_column_settings(
        &mut self,
        stage: AgentStage,
        window: &mut Window,
        cx: &mut Context<Self>,
    ) {
        self.open_settings(window, cx);
        if let Some(panel) = &mut self.settings {
            panel.column = Some(stage);
        }
        self.load_column_skills(stage, cx);
        cx.notify();
    }

    pub(super) fn column_settings_overlay(
        &self,
        stage: AgentStage,
        picker: Option<AnyElement>,
        window: &Window,
        cx: &mut Context<Self>,
    ) -> AnyElement {
        let panel = self.settings.as_ref().expect("open settings");
        let column = panel.column(stage);
        let summary = column.map_or("Project default model".to_owned(), |config| {
            controls::model_label(
                config[HARNESS].as_str().unwrap_or_default(),
                config[MODEL].as_str().unwrap_or_default(),
            )
            .to_string()
        });
        let mode = column
            .and_then(|config| config[RUNTIME_MODE].as_str())
            .unwrap_or_default();
        let anchor = panel.anchor(stage);
        let mut access = div().flex().flex_wrap().gap_1();
        for (value, label) in modes() {
            access = access.child(
                modal::disabled(
                    controls::ghost_button(
                        gpui::SharedString::from(format!("board-column-mode-{value}")),
                        label,
                    )
                    .h(px(26.))
                    .px_2()
                    .text_size(px(11.))
                    .aria_label(format!("{label} access for {}", stage_label(stage)))
                    .aria_selected(mode == value)
                    .debug_selector(move || format!("board-column-mode-{value}"))
                    .when(mode == value, |button| {
                        button.bg(content(0.08)).text_color(content(1.))
                    }),
                    column.is_none(),
                )
                .on_click(cx.listener(move |this, _, _, cx| this.set_stage_mode(stage, value, cx))),
            );
        }
        let body = div()
            .id("board-column-settings")
            .debug_selector(|| "board-column-settings".into())
            .role(Role::Dialog)
            .aria_label(format!("{} settings", stage_label(stage)))
            .track_focus(&panel.focus)
            .flex()
            .flex_col()
            .gap_3()
            .min_h_0()
            .max_h((window.viewport_size().height - px(100.)).max(px(100.)))
            .overflow_y_scroll()
            .p_3()
            .text_size(px(12.))
            .on_key_down(cx.listener(|this, event: &gpui::KeyDownEvent, window, cx| {
                if event.keystroke.key == "escape" && this.picker.is_none() {
                    this.close_settings(window, cx);
                    cx.stop_propagation();
                }
            }))
            .child(
                div()
                    .font_weight(gpui::FontWeight::SEMIBOLD)
                    .child(format!("{} runs with", stage_label(stage))),
            )
            .child(
                div()
                    .text_size(px(11.))
                    .text_color(content(0.5))
                    .child("Every card in this column, unless a card overrides it."),
            )
            .child(anchor.probe())
            .child(
                controls::ghost_button("board-column-settings-model", summary)
                    .w_full()
                    .min_w_0()
                    .truncate()
                    .justify_start()
                    .gap_2()
                    .debug_selector(|| "board-column-settings-model".into())
                    .child(icon("chevrons-up-down", 12.))
                    .on_click(cx.listener(move |this, _, window, cx| {
                        this.open_model_picker(
                            PickTarget::Column(stage),
                            anchor.clone(),
                            window,
                            cx,
                        )
                    })),
            )
            .child(access)
            .child(
                controls::ghost_button(
                    "board-column-settings-default",
                    "Use each project's default",
                )
                .justify_start()
                .text_color(content(0.6))
                .on_click(cx.listener(move |this, _, _, cx| this.reset_stage_model(stage, cx))),
            )
            .when(panel.saved.is_none(), |body| {
                body.child(div().text_color(content(0.5)).child("Loading settings…"))
            })
            .when_some(panel.error.clone(), |body, error| {
                body.child(
                    div()
                        .id("board-column-settings-error")
                        .role(Role::Alert)
                        .text_color(content(1.))
                        .child(error)
                        .child(
                            controls::ghost_button(
                                "board-column-settings-reload",
                                "Reload settings",
                            )
                            .on_click(cx.listener(|this, _, _, cx| this.load_settings(cx))),
                        ),
                )
            })
            .child(self.column_skills(stage, cx));
        let weak = cx.weak_entity();
        let settings = popover(
            "board-column-settings-popover",
            Anchor::Slot(self.column_anchor(stage)),
        )
        .width(320.)
        .padding(0.)
        .ignore(panel.picker_surface.clone())
        .on_dismiss(move |window, cx| {
            let _ = weak.update(cx, |this, cx| {
                if this.picker.is_none() {
                    this.close_settings(window, cx);
                }
            });
        })
        .child(body);
        modal::window_overlay(
            window,
            div()
                .absolute()
                .inset_0()
                .child(settings)
                .when_some(picker, |overlay, picker| overlay.child(picker)),
        )
        .into_any_element()
    }
}
