use super::super::{Board, controls};
use crate::theme::*;
use gpui::{AnyElement, Context, Role, SharedString, div, prelude::*, px};

impl Board {
    pub(in crate::task_board) fn detail_tabs(&self, cx: &mut Context<Self>) -> AnyElement {
        let mut tabs = div()
            .id("board-detail-tabs")
            .flex_wrap()
            .flex_shrink_0()
            .flex()
            .items_center()
            .gap_1()
            .px_3()
            .pb_2()
            .border_b_1()
            .border_color(content(0.08));
        tabs = tabs.child(
            controls::ghost_button("board-tab-overview", "Overview")
                .debug_selector(|| "board-tab-overview".into())
                .role(Role::Tab)
                .aria_selected(self.detail_tab.is_none())
                .when(self.detail_tab.is_none(), |d| {
                    d.bg(content(0.08)).text_color(content(1.))
                })
                .on_click(cx.listener(|this, _, window, cx| {
                    this.detail_tab = None;
                    this.detail_version = None;
                    this.close_artifact(window, cx);
                })),
        );
        let Some(snapshot) = self
            .snapshot
            .as_ref()
            .filter(|s| s.selected == self.selected)
        else {
            return tabs.into_any_element();
        };
        let mut kinds = Vec::new();
        for artifact in &snapshot.artifacts {
            if !kinds.contains(&artifact.kind) {
                kinds.push(artifact.kind.clone());
            }
        }
        for kind in kinds {
            let latest = snapshot
                .artifacts
                .iter()
                .filter(|a| a.kind == kind)
                .max_by_key(|a| a.version)
                .cloned()
                .expect("artifact kind");
            let (label, glyph) = artifact_label(&kind);
            let hint = label.to_owned();
            let key = kind.clone();
            tabs = tabs.child(
                controls::ghost_button(SharedString::from(format!("board-tab-{kind}")), "")
                    .px_2()
                    .aria_label(label.to_owned())
                    .role(Role::Tab)
                    .aria_selected(self.detail_tab.as_ref() == Some(&kind))
                    .debug_selector(move || format!("board-tab-{key}"))
                    .tooltip(move |_, cx| controls::hint(hint.clone(), cx))
                    .when(self.detail_tab.as_ref() == Some(&kind), |d| {
                        d.bg(content(0.08)).text_color(content(1.))
                    })
                    .child(icon(glyph, 14.))
                    .on_click(cx.listener(move |this, _, window, cx| {
                        this.detail_tab = Some(kind.clone());
                        this.detail_version = Some(latest.version);
                        this.open_artifact(latest.clone(), window, cx);
                    })),
            );
        }
        tabs.into_any_element()
    }

    pub(super) fn artifact_detail(&self, cx: &mut Context<Self>) -> AnyElement {
        let kind = self.detail_tab.as_deref().unwrap_or_default();
        let mut versions = div().flex().items_center().flex_wrap().gap_1();
        if let Some(snapshot) = self
            .snapshot
            .as_ref()
            .filter(|s| s.selected == self.selected)
        {
            let mut artifacts: Vec<_> = snapshot
                .artifacts
                .iter()
                .filter(|a| a.kind == kind)
                .collect();
            artifacts.sort_by_key(|a| std::cmp::Reverse(a.version));
            for artifact in artifacts {
                let meta = artifact.clone();
                versions = versions.child(
                    controls::ghost_button(
                        SharedString::from(format!("board-version-{}", meta.id)),
                        format!("v{}", meta.version),
                    )
                    .debug_selector({
                        let id = meta.id.clone();
                        move || format!("board-version-{id}")
                    })
                    .aria_selected(self.detail_version == Some(meta.version))
                    .when(self.detail_version == Some(meta.version), |d| {
                        d.bg(content(0.08))
                    })
                    .on_click(cx.listener(move |this, _, window, cx| {
                        this.detail_version = Some(meta.version);
                        this.open_artifact(meta.clone(), window, cx);
                    })),
                );
            }
        }
        div()
            .id("board-artifact-inline")
            .debug_selector(|| "board-artifact-inline".into())
            .flex_1()
            .min_w_0()
            .h_full()
            .overflow_y_scroll()
            .p_4()
            .when_some(self.artifact.as_ref(), |d, artifact| {
                d.track_focus(&artifact.focus)
            })
            .on_key_down(cx.listener(|this, event: &gpui::KeyDownEvent, window, cx| {
                if event.keystroke.key == "escape" {
                    this.detail_tab = None;
                    this.detail_version = None;
                    this.close_artifact(window, cx);
                    cx.stop_propagation();
                }
            }))
            .child(
                div()
                    .text_size(px(13.))
                    .font_weight(gpui::FontWeight::SEMIBOLD)
                    .mb_3()
                    .child(artifact_label(kind).0.to_owned()),
            )
            .child(versions)
            .child(
                div()
                    .mt_3()
                    .when(self.artifact.is_none(), |d| {
                        d.child("Artifact unavailable. Refresh the task.")
                    })
                    .when_some(self.artifact.as_ref(), |d, a| {
                        d.when(a.preview.is_none() && a.error.is_none(), |d| {
                            d.child("Loading artifact…")
                        })
                        .when_some(a.error.clone(), |d, error| {
                            d.child(
                                div()
                                    .id("board-inline-artifact-error")
                                    .role(Role::Alert)
                                    .text_color(super::super::kanban::look::rose(1.))
                                    .child(error),
                            )
                        })
                        .when_some(a.preview.clone(), |d, preview| d.child(preview))
                    }),
            )
            .into_any_element()
    }
}

fn artifact_label(kind: &str) -> (&str, &'static str) {
    use molfar_core::task_board::stage::contracts::constants::{IMPL_REPORT, PLAN, REVIEW, SPEC};
    match kind {
        SPEC => ("Specification", "file"),
        PLAN => ("Plan", "sticky-note"),
        REVIEW => ("Review", "list-bullet"),
        IMPL_REPORT => ("Implementation report", "file-script"),
        _ => (kind, "sticky-note"),
    }
}
