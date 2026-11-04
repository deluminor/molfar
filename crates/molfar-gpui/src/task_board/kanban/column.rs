use super::look::{
    COLUMN_RADIUS, COLUMN_WIDTH, Kind, amber, emerald, empty_hint, kind_tone, look, note,
};
use crate::task_board::Board;
use crate::theme::*;
use gpui::{
    AnyElement, Context, Div, FontWeight, Role, ScrollHandle, SharedString, Stateful, div,
    prelude::*, px,
};
use molfar_core::task_board::{
    stage::{
        agent::AgentStage,
        choice::settings::{COLUMNS as SETTINGS_COLUMNS, HARNESS, MODEL},
    },
    types::Card,
};

fn note_tone(kind: Kind) -> (gpui::Hsla, gpui::Hsla, gpui::Hsla) {
    match kind {
        Kind::Gate => (amber(0.2), amber(0.05), amber(0.7)),
        Kind::Terminal => (emerald(0.15), emerald(0.04), emerald(0.65)),
        Kind::Queue | Kind::Agent => (content(0.08), content(0.), content(0.45)),
    }
}

impl Board {
    /// The column's saved model config from the snapshot, for chips and the picker.
    pub(in crate::task_board) fn saved_column(
        &self,
        stage: AgentStage,
    ) -> Option<serde_json::Value> {
        let settings: serde_json::Value =
            serde_json::from_str(self.snapshot.as_ref()?.settings_json.as_deref()?).ok()?;
        settings.get(SETTINGS_COLUMNS)?.get(stage.id()).cloned()
    }

    pub(super) fn column_model(&self, stage: AgentStage) -> String {
        self.saved_column(stage)
            .map_or("Project default model".to_owned(), |config| {
                crate::task_board::controls::model_label(
                    config[HARNESS].as_str().unwrap_or_default(),
                    config[MODEL].as_str().unwrap_or_default(),
                )
                .to_string()
            })
    }

    fn column_slot(&self, column: &str, kind: Kind, cx: &mut Context<Self>) -> AnyElement {
        if let Some(stage) = AgentStage::parse(column) {
            let anchor = self.column_anchor(stage);
            let label = self.column_model(stage);
            let selector = format!("board-column-model-{column}");
            return div()
                .child(anchor.probe())
                .child(
                    div()
                        .id(SharedString::from(selector.clone()))
                        .debug_selector(move || selector.clone())
                        .role(Role::Button)
                        .aria_label(format!("Model for this column: {label}"))
                        .h(px(26.))
                        .px_2()
                        .rounded(px(8.))
                        .border_1()
                        .border_color(content(0.08))
                        .flex()
                        .items_center()
                        .gap_1p5()
                        .cursor_pointer()
                        .text_size(px(11.))
                        .text_color(content(0.6))
                        .hover(|s| s.bg(content(0.06)))
                        .child(div().flex_1().min_w_0().truncate().child(label))
                        .child(icon("chevron-down", 12.))
                        .on_click(cx.listener(move |this, _, window, cx| {
                            this.open_column_settings(stage, window, cx)
                        })),
                )
                .into_any_element();
        }

        let Some((glyph, lead, rest)) = note(column) else {
            return div().into_any_element();
        };
        let (border, fill, ink) = note_tone(kind);
        div()
            .h(px(26.))
            .px_2()
            .rounded(px(8.))
            .border_1()
            .border_color(border)
            .bg(fill)
            .flex()
            .items_center()
            .gap_1p5()
            .text_size(px(11.))
            .text_color(ink)
            .child(icon(glyph, 12.).text_color(ink))
            .child(div().font_weight(FontWeight::MEDIUM).child(lead))
            .child(div().min_w_0().truncate().child(format!("· {rest}")))
            .into_any_element()
    }

    pub(super) fn kanban_column(
        &self,
        column: &str,
        label: &str,
        cards: &[&Card],
        scroll: &ScrollHandle,
        cx: &mut Context<Self>,
    ) -> Stateful<Div> {
        let (glyph, kind) = look(column);
        let (chip_fill, chip_ink) = kind_tone(kind);
        let count = cards.len();
        let plural = if count == 1 { "" } else { "s" };
        let selector = format!("board-column-{column}");
        let body_id = SharedString::from(format!("board-column-body-{column}"));

        let mut body = div()
            .id(body_id)
            .flex_1()
            .min_h_0()
            .flex()
            .flex_col()
            .gap_2()
            .overflow_y_scroll()
            .track_scroll(scroll)
            .px_2()
            .pb_2()
            .pt(px(6.));
        for card in cards {
            body = body.child(self.kanban_card(card, cx));
        }
        if cards.is_empty() {
            body = body.child(
                div()
                    .mx_1()
                    .mt_1()
                    .py_6()
                    .px_3()
                    .flex()
                    .flex_col()
                    .items_center()
                    .gap_2()
                    .child(icon(glyph, 20.).text_color(content(0.15)))
                    .child(
                        div()
                            .text_size(px(12.))
                            .text_color(content(0.35))
                            .child(empty_hint(column)),
                    ),
            );
        }

        div()
            .id(SharedString::from(selector.clone()))
            .debug_selector(move || selector.clone())
            .role(Role::Group)
            .aria_label(format!("{label}, {count} card{plural}"))
            .relative()
            .h_full()
            .w(px(COLUMN_WIDTH))
            .flex_shrink_0()
            .flex()
            .flex_col()
            .rounded(px(COLUMN_RADIUS))
            .border_1()
            .border_color(content(0.08))
            .bg(content(0.025))
            .child(
                div()
                    .flex_shrink_0()
                    .flex()
                    .flex_col()
                    .gap_2()
                    .px_3()
                    .pt_3()
                    .pb(px(10.))
                    .child(
                        div()
                            .flex()
                            .items_center()
                            .gap_2()
                            .child(
                                div()
                                    .size(px(24.))
                                    .flex_shrink_0()
                                    .rounded(px(6.))
                                    .bg(chip_fill)
                                    .flex()
                                    .items_center()
                                    .justify_center()
                                    .child(icon(glyph, 14.).text_color(chip_ink)),
                            )
                            .child(
                                div()
                                    .min_w_0()
                                    .truncate()
                                    .text_size(px(13.))
                                    .font_weight(FontWeight::MEDIUM)
                                    .text_color(content(0.9))
                                    .child(label.to_owned()),
                            )
                            .child(
                                div()
                                    .min_w(px(20.))
                                    .px(px(6.))
                                    .rounded(px(6.))
                                    .bg(content(0.07))
                                    .text_size(px(11.))
                                    .text_color(content(0.55))
                                    .text_center()
                                    .child(count.to_string()),
                            ),
                    )
                    .child(self.column_slot(column, kind, cx)),
            )
            .child(body)
    }
}
