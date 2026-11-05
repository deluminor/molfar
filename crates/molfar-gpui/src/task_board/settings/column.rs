use super::{super::Board, PickTarget, modes, stage_label};
use crate::{
    modal,
    popover::{Anchor, popover},
    task_board::controls,
    theme::*,
};
use gpui::{AnyElement, Context, Div, Role, SharedString, Window, div, prelude::*, px};
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

        let body = div()
            .id("board-column-settings")
            .debug_selector(|| "board-column-settings".into())
            .role(Role::Dialog)
            .aria_label(format!("{} settings", stage_label(stage)))
            .track_focus(&panel.focus)
            .flex()
            .flex_col()
            .gap_4()
            .min_h_0()
            .max_h((window.viewport_size().height - px(100.)).max(px(100.)))
            .overflow_y_scroll()
            .p_3()
            .text_size(px(12.))
            .on_key_down(cx.listener(|this, event: &gpui::KeyDownEvent, window, cx| {
                if event.keystroke.key != "escape" || this.picker.is_some() {
                    return;
                }
                if this
                    .settings
                    .as_ref()
                    .is_some_and(|panel| panel.adding_skills)
                {
                    this.close_skill_adder(window, cx);
                } else {
                    this.close_settings(window, cx);
                }
                cx.stop_propagation();
            }))
            .child(
                div()
                    .flex()
                    .flex_col()
                    .gap_1()
                    .child(
                        div()
                            .text_size(px(13.))
                            .font_weight(gpui::FontWeight::SEMIBOLD)
                            .child(format!("{} runs with", stage_label(stage))),
                    )
                    .child(
                        div()
                            .text_size(px(11.))
                            .text_color(content(0.5))
                            .child("Every card in this column, unless a card overrides it."),
                    ),
            )
            .child(self.column_model_section(stage, cx))
            .child(self.column_access_section(stage, cx))
            .when(panel.saved.is_none(), |body| {
                body.child(div().text_color(content(0.5)).child("Loading settings…"))
            })
            .when_some(panel.error.clone(), |body, error| {
                body.child(
                    div()
                        .id("board-column-settings-error")
                        .role(Role::Alert)
                        .flex()
                        .items_center()
                        .justify_between()
                        .gap_2()
                        .text_color(content(1.))
                        .child(div().min_w_0().child(error))
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

    fn column_model_section(&self, stage: AgentStage, cx: &mut Context<Self>) -> Div {
        let panel = self.settings.as_ref().expect("open settings");
        let column = panel.column(stage);
        let summary = column.map_or("Project default model".to_owned(), |config| {
            controls::model_label(
                config[HARNESS].as_str().unwrap_or_default(),
                config[MODEL].as_str().unwrap_or_default(),
            )
            .to_string()
        });
        let anchor = panel.anchor(stage);

        let trigger = controls::ghost_button("board-column-settings-model", summary)
            .w_full()
            .min_w_0()
            .truncate()
            .justify_between()
            .gap_2()
            .bg(content(0.05))
            .text_color(content(0.9))
            .debug_selector(|| "board-column-settings-model".into())
            .child(anchor.probe())
            .child(icon("chevrons-up-down", 12.).text_color(content(0.5)))
            .on_click(cx.listener(move |this, _, window, cx| {
                this.open_model_picker(PickTarget::Column(stage), anchor.clone(), window, cx)
            }));

        section("Model")
            .child(trigger)
            .when(column.is_some(), |section| {
                section.child(
                    controls::ghost_button("board-column-settings-default", "Use project default")
                        .self_start()
                        .text_size(px(11.))
                        .text_color(content(0.5))
                        .on_click(
                            cx.listener(move |this, _, _, cx| this.reset_stage_model(stage, cx)),
                        ),
                )
            })
    }

    fn column_access_section(&self, stage: AgentStage, cx: &mut Context<Self>) -> Div {
        let panel = self.settings.as_ref().expect("open settings");
        let column = panel.column(stage);
        let mode = column
            .and_then(|config| config[RUNTIME_MODE].as_str())
            .unwrap_or_default();

        let mut segments = div()
            .flex()
            .p(px(2.))
            .gap(px(2.))
            .rounded_lg()
            .bg(content(0.05));
        for (value, label) in modes() {
            let selected = mode == value;
            segments = segments.child(
                modal::disabled(
                    div()
                        .id(SharedString::from(format!("board-column-mode-{value}")))
                        .flex_1()
                        .min_w_0()
                        .h(px(24.))
                        .flex()
                        .items_center()
                        .justify_center()
                        .rounded_md()
                        .text_size(px(11.))
                        .whitespace_nowrap()
                        .cursor_pointer()
                        .text_color(content(0.6))
                        .hover(|style| style.text_color(content(1.)))
                        .role(Role::Button)
                        .aria_label(format!("{label} access for {}", stage_label(stage)))
                        .aria_selected(selected)
                        .debug_selector(move || format!("board-column-mode-{value}"))
                        .when(selected, |button| {
                            button
                                .bg(content(0.1))
                                .text_color(content(1.))
                                .font_weight(gpui::FontWeight::MEDIUM)
                        })
                        .child(label),
                    column.is_none(),
                )
                .on_click(cx.listener(move |this, _, _, cx| this.set_stage_mode(stage, value, cx))),
            );
        }

        section("Access")
            .child(segments)
            .when(column.is_none(), |section| {
                section.child(
                    div()
                        .text_size(px(11.))
                        .text_color(content(0.45))
                        .child("Pick a model to set access for this column."),
                )
            })
    }
}

pub(super) fn section(title: &'static str) -> Div {
    div().flex().flex_col().gap_2().child(
        div()
            .text_size(px(11.))
            .font_weight(gpui::FontWeight::MEDIUM)
            .text_color(content(0.55))
            .child(title),
    )
}
