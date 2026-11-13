use super::super::{Board, controls};
use super::groups::{self, Group};
use crate::theme::*;
use gpui::{AnyElement, Context, Role, div, prelude::*, px};
use molfar_core::task_board::{
    constants::{FINAL_REVIEW, IDLE, PLAN_APPROVAL},
    stage::{
        contracts::constants::{ANSWERS, QUESTIONS},
        lifecycle::constants::FAILED,
    },
    types::{ArtifactMeta, Card},
};

/// What the card waits on the owner for, and the tabs that answer it.
fn waiting(card: &Card, artifacts: &[ArtifactMeta]) -> Option<(String, Vec<Group>)> {
    if card.archived {
        return None;
    }
    let latest = |group| {
        groups::versions(artifacts, &card.id, group)
            .first()
            .copied()
    };

    if card.column_id == PLAN_APPROVAL && card.run_state == IDLE {
        let plan = latest(Group::Plan)?;
        let round = latest(Group::Questions);
        let unanswered = round.is_some_and(|round| {
            let kinds: Vec<String> = groups::members(artifacts, &card.id, Group::Questions, round)
                .into_iter()
                .map(|(_, meta)| meta.kind)
                .collect();
            kinds.iter().any(|kind| kind == QUESTIONS) && !kinds.iter().any(|kind| kind == ANSWERS)
        });
        let mut message = format!(
            "Plan {} is ready for your approval.",
            Group::Plan.version_label(plan)
        );
        let mut tabs = vec![Group::Plan];
        if unanswered {
            message.push_str(" Grill also left questions for you.");
            tabs.push(Group::Questions);
        }
        return Some((message, tabs));
    }
    if card.column_id == FINAL_REVIEW && matches!(card.run_state.as_str(), IDLE | FAILED) {
        latest(Group::Review)?;
        return Some((
            "Code review is done. Pick findings to rework or deliver.".into(),
            vec![Group::Review],
        ));
    }
    None
}

impl Board {
    pub(super) fn waiting_banner(&self, card: &Card, cx: &mut Context<Self>) -> Option<AnyElement> {
        let snapshot = self
            .snapshot
            .as_ref()
            .filter(|s| s.selected == self.selected)?;
        let (message, tabs) = waiting(card, &snapshot.artifacts)?;

        let mut actions = div().flex().flex_wrap().gap_1();
        for group in tabs {
            actions = actions.child(
                controls::ghost_button(
                    gpui::SharedString::from(format!("board-waiting-{}", group.id())),
                    format!("Open {}", group.label()),
                )
                .debug_selector(move || format!("board-waiting-{}", group.id()))
                .text_color(accent_color())
                .on_click(
                    cx.listener(move |this, _, window, cx| this.open_latest(group, window, cx)),
                ),
            );
        }

        Some(
            div()
                .id("board-waiting")
                .debug_selector(|| "board-waiting".into())
                .role(Role::Status)
                .mt_4()
                .p_3()
                .flex()
                .flex_col()
                .gap_2()
                .rounded_lg()
                .border_1()
                .border_color(accent_color().opacity(0.3))
                .bg(accent_color().opacity(0.08))
                .child(
                    div()
                        .flex()
                        .items_start()
                        .gap_2()
                        .text_size(px(12.5))
                        .child(icon("bell", 14.).mt(px(1.)).text_color(accent_color()))
                        .child(div().flex_1().min_w_0().child(message)),
                )
                .child(actions)
                .into_any_element(),
        )
    }
}
