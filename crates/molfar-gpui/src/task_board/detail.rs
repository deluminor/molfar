use super::Board;
use crate::theme::*;
use gpui::{AnyElement, Context, FontWeight, div, prelude::*, px};

fn field(label: &'static str, value: impl Into<String>) -> AnyElement {
    div()
        .mb_4()
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
    pub(super) fn detail(&self, cx: &mut Context<Self>) -> AnyElement {
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
        detail = detail
            .child(
                div()
                    .mb_4()
                    .text_size(px(20.))
                    .font_weight(FontWeight::SEMIBOLD)
                    .child(format!("#{} {}", card.number, card.title)),
            )
            .child(field("Project", card.project_cwd.clone()))
            .child(field(
                "State",
                format!("{} · {}", card.column_id, card.run_state),
            ))
            .child(field("Description", card.description.clone()))
            .child(field(
                "Acceptance criteria",
                card.acceptance_criteria.clone(),
            ))
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
        detail = detail
            .child(self.stage_actions(card, cx))
            .child(field("Stage runs", snapshot.runs.len().to_string()));
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
                crate::modal::ghost_button(
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
