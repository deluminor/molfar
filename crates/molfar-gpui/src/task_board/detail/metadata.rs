use super::super::{Board, controls, kanban::look, stage};
use crate::theme::*;
use gpui::{AnyElement, Context, Role, div, prelude::*, px};

fn field(label: &'static str, value: impl Into<String>) -> AnyElement {
    div()
        .flex()
        .items_start()
        .gap_3()
        .text_size(px(12.))
        .child(
            div()
                .w(px(88.))
                .flex_shrink_0()
                .text_color(content(0.5))
                .child(label),
        )
        .child(
            div()
                .flex_1()
                .min_w_0()
                .text_color(content(0.8))
                .child(value.into()),
        )
        .into_any_element()
}

pub(super) fn section(label: &'static str) -> gpui::Div {
    div()
        .mt_5()
        .mb_3()
        .text_size(px(11.))
        .font_weight(gpui::FontWeight::MEDIUM)
        .text_color(content(0.5))
        .child(label)
}

impl Board {
    pub(in crate::task_board) fn detail(&self, cx: &mut Context<Self>) -> AnyElement {
        if self.detail_tab.is_some() {
            return self.artifact_detail(cx);
        }
        let mut detail = div()
            .id("board-detail")
            .debug_selector(|| "board-detail".into())
            .flex_1()
            .min_w_0()
            .h_full()
            .overflow_y_scroll()
            .px_4()
            .pb_4();
        let Some(snapshot) = &self.snapshot else {
            return detail.into_any_element();
        };
        let Some(card) = snapshot
            .cards
            .iter()
            .find(|card| Some(&card.id) == self.selected.as_ref())
        else {
            return detail.child("Select a card").into_any_element();
        };
        detail = detail
            .when_some(card.last_error.clone(), |d, error| {
                d.child(
                    div()
                        .id("board-detail-warning")
                        .mt_4()
                        .p_3()
                        .flex()
                        .gap_2()
                        .rounded_lg()
                        .border_1()
                        .border_color(look::rose(0.2))
                        .bg(look::rose(0.07))
                        .text_color(look::rose(1.))
                        .text_size(px(12.))
                        .role(Role::Alert)
                        .child(icon("circle-alert", 14.))
                        .child(div().flex_1().min_w_0().child(error)),
                )
            })
            .children(self.waiting_banner(card, cx))
            .child(section("Task"))
            .when_some(
                self.detail_content
                    .as_ref()
                    .filter(|c| c.card_id == card.id),
                |d, c| {
                    d.child(
                        div()
                            .p_3()
                            .rounded_lg()
                            .border_1()
                            .border_color(content(0.07))
                            .bg(content(0.025))
                            .child(c.description_view.clone())
                            .when(!card.acceptance_criteria.trim().is_empty(), |d| {
                                d.child(
                                    div()
                                        .mt_3()
                                        .pt_3()
                                        .border_t_1()
                                        .border_color(content(0.07))
                                        .child(
                                            div()
                                                .mb_2()
                                                .text_size(px(11.))
                                                .text_color(content(0.55))
                                                .child("Acceptance criteria"),
                                        )
                                        .child(c.criteria_view.clone()),
                                )
                            }),
                    )
                },
            )
            .child(section("Details"))
            .child(
                div()
                    .flex()
                    .flex_col()
                    .gap_1p5()
                    .child(field(
                        "Project",
                        crate::workspace::project_name(&card.project_cwd),
                    ))
                    .child(field(
                        "Base",
                        card.base_ref.as_deref().unwrap_or("default branch"),
                    ))
                    .when_some(card.base_sha.as_ref(), |d, sha| {
                        d.child(field(
                            "Base commit",
                            sha.chars().take(10).collect::<String>(),
                        ))
                    })
                    .child(field(
                        "Rounds",
                        format!("grill {} · rework {}", card.grill_round, card.rework_cycle),
                    ))
                    .when_some(stage::delivery::pull_request_url(card), |d, url| {
                        let target = url.clone();
                        d.child(
                            div()
                                .flex()
                                .gap_3()
                                .text_size(px(12.))
                                .child(
                                    div()
                                        .w(px(88.))
                                        .flex_shrink_0()
                                        .text_color(content(0.5))
                                        .child("Pull request"),
                                )
                                .child(
                                    div()
                                        .id("board-detail-pr")
                                        .min_w_0()
                                        .cursor_pointer()
                                        .text_color(accent_color())
                                        .child(
                                            url.trim_start_matches("https://github.com/")
                                                .to_owned(),
                                        )
                                        .on_click(move |_, _, cx| cx.open_url(&target)),
                                ),
                        )
                    })
                    .when_some(card.worktree_path.clone(), |d, path| {
                        let hint = path.clone();
                        d.child(
                            div()
                                .id("board-detail-worktree")
                                .flex()
                                .gap_3()
                                .text_size(px(12.))
                                .child(
                                    div()
                                        .w(px(88.))
                                        .flex_shrink_0()
                                        .text_color(content(0.5))
                                        .child("Worktree"),
                                )
                                .child(
                                    div()
                                        .id("board-worktree-path")
                                        .flex_1()
                                        .min_w_0()
                                        .truncate()
                                        .text_color(content(0.65))
                                        .child(path)
                                        .tooltip(move |_, cx| controls::hint(hint.clone(), cx)),
                                ),
                        )
                    }),
            );
        if snapshot.selected != self.selected {
            return detail
                .child(
                    div()
                        .id("board-detail-metadata-pending")
                        .debug_selector(|| "board-detail-metadata-pending".into())
                        .mt_3()
                        .text_size(px(12.))
                        .text_color(content(0.5))
                        .child(if self.loading {
                            "Updating task metadata…"
                        } else {
                            "Task metadata unavailable. Retry refresh."
                        }),
                )
                .into_any_element();
        }
        detail
            .child(section("Stages"))
            .child(self.stage_timeline(&snapshot.runs, cx))
            .child(section("Usage"))
            .child(self.usage_block(&card.id))
            .into_any_element()
    }
}
