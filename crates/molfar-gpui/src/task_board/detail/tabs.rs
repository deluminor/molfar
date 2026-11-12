use super::super::{Board, controls};
use super::groups::{self, Group};
use crate::theme::*;
use gpui::{AnyElement, Context, Role, Window, div, prelude::*, px};

fn tab(id: &'static str, selected: bool) -> gpui::Stateful<gpui::Div> {
    controls::ghost_button(id, "")
        .gap_1p5()
        .role(Role::Tab)
        .aria_selected(selected)
        .debug_selector(move || id.into())
        .when(selected, |d| d.bg(content(0.08)).text_color(content(1.)))
}

impl Board {
    pub(in crate::task_board) fn open_group(
        &mut self,
        group: Group,
        version: i64,
        window: &mut Window,
        cx: &mut Context<Self>,
    ) {
        let (Some(snapshot), Some(card_id)) = (&self.snapshot, &self.selected) else {
            return;
        };
        let members = groups::members(&snapshot.artifacts, card_id, group, version);
        self.detail_tab = Some(group.id().into());
        self.detail_version = Some(version);
        self.open_artifact(members, window, cx);
    }

    pub(in crate::task_board) fn open_latest(
        &mut self,
        group: Group,
        window: &mut Window,
        cx: &mut Context<Self>,
    ) {
        let (Some(snapshot), Some(card_id)) = (&self.snapshot, &self.selected) else {
            return;
        };
        if let Some(latest) = groups::versions(&snapshot.artifacts, card_id, group).first() {
            self.open_group(group, *latest, window, cx);
        }
    }

    pub(in crate::task_board) fn detail_tabs(&self, cx: &mut Context<Self>) -> AnyElement {
        let mut tabs = div()
            .id("board-detail-tabs")
            .role(Role::TabList)
            .flex_wrap()
            .flex_shrink_0()
            .flex()
            .items_center()
            .gap_1()
            .px_3()
            .pb_2()
            .border_b_1()
            .border_color(content(0.08))
            .child(
                tab("board-tab-overview", self.detail_tab.is_none())
                    .child("Overview")
                    .on_click(cx.listener(|this, _, window, cx| {
                        this.detail_tab = None;
                        this.detail_version = None;
                        this.close_artifact(window, cx);
                    })),
            );
        let (Some(snapshot), Some(card_id)) = (
            self.snapshot
                .as_ref()
                .filter(|s| s.selected == self.selected),
            self.selected.as_ref(),
        ) else {
            return tabs.into_any_element();
        };

        for group in groups::present(&snapshot.artifacts, card_id) {
            let versions = groups::versions(&snapshot.artifacts, card_id, group);
            let selected = self.detail_tab.as_deref() == Some(group.id());
            let id: &'static str = match group {
                Group::Plan => "board-tab-plan",
                Group::Questions => "board-tab-questions",
                Group::Review => "board-tab-review",
                Group::Delivery => "board-tab-delivery",
            };
            tabs = tabs.child(
                tab(id, selected)
                    .child(group.label())
                    .when(versions.len() > 1, |d| {
                        d.child(
                            div()
                                .text_size(px(10.5))
                                .text_color(content(0.5))
                                .child(group.version_label(versions[0])),
                        )
                    })
                    .on_click(
                        cx.listener(move |this, _, window, cx| this.open_latest(group, window, cx)),
                    ),
            );
        }
        tabs.into_any_element()
    }

    pub(super) fn artifact_detail(&self, cx: &mut Context<Self>) -> AnyElement {
        let group = self.detail_tab.as_deref().and_then(Group::parse);
        let mut body = div()
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
            .children(group.and_then(|group| self.version_bar(group, cx)));

        let Some(artifact) = &self.artifact else {
            return body
                .child(
                    div()
                        .mt_3()
                        .child("Artifact unavailable. Refresh the task."),
                )
                .into_any_element();
        };
        if let Some(error) = artifact.error.clone() {
            return body
                .child(
                    div()
                        .id("board-inline-artifact-error")
                        .mt_3()
                        .role(Role::Alert)
                        .text_color(super::super::kanban::look::rose(1.))
                        .child(error),
                )
                .into_any_element();
        }
        let Some(sections) = &artifact.sections else {
            return body
                .child(div().mt_3().child("Loading…"))
                .into_any_element();
        };
        for section in sections {
            body = body
                .child(super::metadata::section(section.heading))
                .child(section.preview.clone());
        }
        body.into_any_element()
    }
}
