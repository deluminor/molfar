use super::super::{
    Board, controls,
    kanban::{look, status},
};
use crate::theme::*;
use gpui::{AnyElement, Context, FontWeight, div, prelude::*, px};
use molfar_core::task_board::{constants::COLUMNS, types::Card};

impl Board {
    pub(in crate::task_board) fn detail_header(
        &self,
        card: &Card,
        ready: bool,
        cx: &mut Context<Self>,
    ) -> AnyElement {
        let label = COLUMNS
            .iter()
            .find(|(id, _)| *id == card.column_id)
            .map_or(card.column_id.as_str(), |(_, label)| *label);
        let (glyph, kind) = look::look(&card.column_id);
        let (fill, ink) = look::kind_tone(kind);
        div()
            .id("board-detail-header")
            .aria_description(super::super::stage::delivery::status_text(card))
            .flex_shrink_0()
            .flex()
            .flex_col()
            .gap_2()
            .px_4()
            .py_3()
            .child(
                div()
                    .flex()
                    .items_center()
                    .gap_2()
                    .child(
                        div()
                            .text_size(px(12.))
                            .text_color(content(0.55))
                            .child(format!("#{}", card.number)),
                    )
                    .child(
                        div()
                            .flex_1()
                            .min_w_0()
                            .text_size(px(13.))
                            .font_weight(FontWeight::SEMIBOLD)
                            .line_clamp(2)
                            .child(card.title.clone()),
                    )
                    .when(ready, |d| {
                        d.children(self.edit_action(card, self.stage_pending.is_some(), cx))
                    })
                    .child(
                        icon_button("board-detail-close", "Close details (Esc)", "x")
                            .size(px(28.))
                            .debug_selector(|| "board-detail-close".into())
                            .on_click(cx.listener(|this, _, window, cx| {
                                this.close_detail(cx);
                                window.focus(&this.focus, cx);
                            })),
                    ),
            )
            .child(
                div()
                    .flex()
                    .items_center()
                    .flex_wrap()
                    .gap_2()
                    .child(
                        div()
                            .flex()
                            .items_center()
                            .gap_1()
                            .px_2()
                            .py_0p5()
                            .rounded_md()
                            .bg(fill)
                            .text_color(ink)
                            .text_size(px(11.))
                            .child(icon(glyph, 12.))
                            .child(label.to_owned()),
                    )
                    .when_some(status::status(card), |d, (kind, text)| {
                        let (fill, ink) = status::chip(kind);
                        d.child(
                            div()
                                .px_2()
                                .py_0p5()
                                .rounded_md()
                                .bg(fill)
                                .text_color(ink)
                                .text_size(px(11.))
                                .child(text),
                        )
                    })
                    .child(crate::project_settings::project_icon(
                        &self.project_appearance(&card.project_cwd),
                        &card.project_cwd,
                        14.,
                    ))
                    .child(
                        div().text_size(px(11.)).text_color(content(0.6)).child(
                            self.project_appearance(&card.project_cwd)
                                .label(&card.project_cwd),
                        ),
                    ),
            )
            .when_some(card.branch.clone(), |d, branch| {
                let hint = branch.clone();
                d.child(
                    div()
                        .flex()
                        .items_center()
                        .gap_2()
                        .text_size(px(11.))
                        .text_color(content(0.5))
                        .child(icon("git-branch", 12.))
                        .child(
                            div()
                                .id("board-detail-branch")
                                .min_w_0()
                                .truncate()
                                .child(branch)
                                .tooltip(move |_, cx| controls::hint(hint.clone(), cx)),
                        ),
                )
            })
            .into_any_element()
    }
}
