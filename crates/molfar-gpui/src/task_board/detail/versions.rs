use super::super::{Board, controls};
use super::groups::{self, Group};
use crate::theme::*;
use gpui::{AnyElement, Context, Role, SharedString, div, prelude::*, px};
use molfar_core::task_board::{
    constants::{COLUMNS, USER},
    types::{ArtifactMeta, StageRun},
};

fn origin(meta: &ArtifactMeta, runs: &[StageRun]) -> String {
    let author = match runs
        .iter()
        .find(|r| Some(&r.id) == meta.stage_run_id.as_ref())
    {
        Some(run) => {
            let stage = COLUMNS
                .iter()
                .find(|(id, _)| *id == run.stage)
                .map_or(run.stage.as_str(), |(_, name)| *name);
            if run.attempt > 1 {
                format!("From {stage}, attempt {}", run.attempt)
            } else {
                format!("From {stage}")
            }
        }
        None if meta.source == USER => "Written by you".into(),
        None => "Recorded by MOLFAR".into(),
    };
    let now = molfar_core::time::now_ms();
    let when = molfar_core::time::relative(u64::try_from(meta.created_at).unwrap_or(0), now);

    match when.as_str() {
        "" => author,
        "now" => format!("{author} · just now"),
        _ => format!("{author} · {when} ago"),
    }
}

impl Board {
    pub(super) fn version_bar(&self, group: Group, cx: &mut Context<Self>) -> Option<AnyElement> {
        let snapshot = self.snapshot.as_ref()?;
        let card_id = self.selected.as_ref()?;
        let versions = groups::versions(&snapshot.artifacts, card_id, group);
        let shown = self.detail_version?;
        let current = *versions.first()?;
        let first = groups::members(&snapshot.artifacts, card_id, group, shown)
            .into_iter()
            .next()?
            .1;

        let mut chips = div().flex().items_center().flex_wrap().gap_1();
        if versions.len() > 1 {
            for version in versions {
                let label = if version == current {
                    format!("{} · current", group.version_label(version))
                } else {
                    group.version_label(version)
                };
                chips = chips.child(
                    controls::ghost_button(
                        SharedString::from(format!("board-version-{}-{version}", group.id())),
                        label,
                    )
                    .debug_selector(move || format!("board-version-{}-{version}", group.id()))
                    .aria_selected(shown == version)
                    .when(shown == version, |d| {
                        d.bg(content(0.08)).text_color(content(1.))
                    })
                    .on_click(cx.listener(move |this, _, window, cx| {
                        this.open_group(group, version, window, cx)
                    })),
                );
            }
        }

        Some(
            div()
                .flex()
                .flex_col()
                .gap_2()
                .child(chips)
                .child(
                    div()
                        .text_size(px(11.5))
                        .text_color(content(0.5))
                        .child(origin(&first, &snapshot.runs)),
                )
                .when(shown != current, |d| {
                    d.child(
                        div()
                            .id("board-version-older")
                            .debug_selector(|| "board-version-older".into())
                            .role(Role::Status)
                            .flex()
                            .items_center()
                            .gap_2()
                            .p_2()
                            .rounded_md()
                            .bg(content(0.04))
                            .text_size(px(12.))
                            .text_color(content(0.7))
                            .child(icon("history", 13.))
                            .child(div().flex_1().child(format!(
                                "Older version. Current is {}.",
                                group.version_label(current)
                            )))
                            .child(
                                controls::ghost_button("board-version-current", "Show current")
                                    .debug_selector(|| "board-version-current".into())
                                    .on_click(cx.listener(move |this, _, window, cx| {
                                        this.open_group(group, current, window, cx)
                                    })),
                            ),
                    )
                })
                .into_any_element(),
        )
    }
}
