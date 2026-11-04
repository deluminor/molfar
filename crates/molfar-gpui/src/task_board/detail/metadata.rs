use super::super::Board;
use crate::task_board::controls;
use crate::task_board::stage;
use crate::theme::*;
use gpui::{AnyElement, Context, FontWeight, div, prelude::*, px};

fn field(label: &'static str, value: impl Into<String>) -> AnyElement {
    div()
        .mb_3()
        .child(
            div()
                .mb_1()
                .text_size(px(12.))
                .text_color(content(0.6))
                .child(label),
        )
        .child(div().text_size(px(13.)).child(value.into()))
        .into_any_element()
}

impl Board {
    pub(in crate::task_board) fn detail(&self, cx: &mut Context<Self>) -> AnyElement {
        let mut detail = div()
            .id("board-detail")
            .debug_selector(|| "board-detail".into())
            .flex_1()
            .min_w_0()
            .h_full()
            .overflow_y_scroll()
            .p_4();
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
        let project_path = card.project_cwd.clone();
        detail = detail
            .child(
                div()
                    .mb_3()
                    .text_size(px(16.))
                    .font_weight(FontWeight::SEMIBOLD)
                    .child(format!("#{} {}", card.number, card.title)),
            )
            .child(
                div()
                    .id("board-detail-project")
                    .aria_description(card.project_cwd.clone())
                    .tooltip(move |_, cx| controls::hint(project_path.clone(), cx))
                    .child(field(
                        "Project",
                        std::path::Path::new(&card.project_cwd)
                            .file_name()
                            .and_then(|n| n.to_str())
                            .unwrap_or(&card.project_cwd)
                            .to_owned(),
                    )),
            )
            .child(field("State", stage::delivery::status_text(card)))
            .when_some(stage::delivery::pull_request_url(card), |d, url| {
                d.child(field("Pull request", url))
            })
            .when_some(
                self.detail_content
                    .as_ref()
                    .filter(|c| c.card_id == card.id),
                |d, content| {
                    d.child(
                        div()
                            .mb_4()
                            .p_3()
                            .rounded_lg()
                            .border_1()
                            .border_color(crate::theme::content(0.08))
                            .bg(crate::theme::content(0.025))
                            .child(
                                div()
                                    .mb_2()
                                    .text_size(px(12.))
                                    .text_color(crate::theme::content(0.6))
                                    .child("Task"),
                            )
                            .child(content.description_view.clone())
                            .when(!card.acceptance_criteria.trim().is_empty(), |d| {
                                d.child(
                                    div()
                                        .mt_3()
                                        .pt_3()
                                        .border_t_1()
                                        .border_color(crate::theme::content(0.08))
                                        .child(
                                            div()
                                                .mb_2()
                                                .text_size(px(12.))
                                                .text_color(crate::theme::content(0.6))
                                                .child("Acceptance criteria"),
                                        )
                                        .child(content.criteria_view.clone()),
                                )
                            }),
                    )
                },
            )
            .when_some(card.last_error.clone(), |d, error| {
                d.child(field("Error", error))
            })
            .when_some(card.base_ref.clone(), |d, base| {
                d.child(field("Base", base))
            })
            .when_some(card.worktree_path.clone(), |d, path| {
                d.child(field("Worktree", path))
            });
        if snapshot.selected.as_ref() != self.selected.as_ref() {
            return detail
                .child(
                    div()
                        .id("board-detail-metadata-pending")
                        .debug_selector(|| "board-detail-metadata-pending".into())
                        .text_color(content(0.6))
                        .child(if self.loading {
                            "Updating task metadata…"
                        } else {
                            "Task metadata unavailable. Retry refresh."
                        }),
                )
                .into_any_element();
        }
        detail = detail.child(field("Stage runs", snapshot.runs.len().to_string()));
        for run in &snapshot.runs {
            detail = detail
                .child(field(
                    "Run",
                    format!(
                        "{} · attempt {} · {} · {} · {}",
                        run.stage, run.attempt, run.status, run.harness, run.model
                    ),
                ))
                .when_some(run.error.clone(), |d, error| {
                    d.child(field("Run error", error))
                });
        }
        detail = detail.child(field("Artifacts", snapshot.artifacts.len().to_string()));
        for artifact in &snapshot.artifacts {
            let selected = artifact.clone();
            detail = detail.child(
                controls::ghost_button(
                    gpui::SharedString::from(format!("board-artifact-{}", artifact.id)),
                    format!("Read {} v{}", artifact.kind, artifact.version),
                )
                .on_click(cx.listener(move |this, _, window, cx| {
                    this.open_artifact(selected.clone(), window, cx)
                })),
            );
            detail = detail.child(field(
                "Version",
                format!(
                    "{} v{} · {}",
                    artifact.kind, artifact.version, artifact.source
                ),
            ));
        }
        detail.into_any_element()
    }
}
