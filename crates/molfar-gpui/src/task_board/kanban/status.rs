use super::look::{emerald, rose};
use crate::theme::{accent_color, content};
use gpui::Hsla;
use molfar_core::task_board::{
    constants::{DONE, FINAL_REVIEW, PLAN_APPROVAL, WAITING_CI},
    stage::lifecycle::constants::{FAILED, QUEUED, RUNNING},
    types::Card,
};

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub(in crate::task_board) enum StatusKind {
    Queued,
    Running,
    NeedsYou,
    Failed,
    Delivered,
}

/// Desktop card status without the live elapsed timer.
pub(in crate::task_board) fn status(card: &Card) -> Option<(StatusKind, &'static str)> {
    match (card.column_id.as_str(), card.run_state.as_str()) {
        (_, FAILED) => Some((StatusKind::Failed, "Failed")),
        (_, QUEUED) => Some((StatusKind::Queued, "Queued")),
        (FINAL_REVIEW, RUNNING) => Some((StatusKind::Running, "Delivering")),
        (FINAL_REVIEW, WAITING_CI) => Some((StatusKind::Running, "Waiting for CI")),
        (_, RUNNING) => Some((StatusKind::Running, "Running")),
        (PLAN_APPROVAL | FINAL_REVIEW, _) => Some((StatusKind::NeedsYou, "Needs you")),
        (DONE, _) => Some((StatusKind::Delivered, "Delivered")),
        _ => None,
    }
}

pub(in crate::task_board) fn stripe(kind: StatusKind) -> Hsla {
    match kind {
        StatusKind::Queued => content(0.25),
        StatusKind::Running | StatusKind::NeedsYou => {
            let mut accent = accent_color();
            accent.a = 0.85;
            accent
        }
        StatusKind::Failed => rose(0.85),
        StatusKind::Delivered => emerald(0.8),
    }
}

pub(in crate::task_board) fn chip(kind: StatusKind) -> (Hsla, Hsla) {
    match kind {
        StatusKind::Queued => (content(0.07), content(0.6)),
        StatusKind::Running | StatusKind::NeedsYou => {
            let mut fill = accent_color();
            fill.a = 0.14;
            (fill, accent_color())
        }
        StatusKind::Failed => (rose(0.12), rose(1.)),
        StatusKind::Delivered => (emerald(0.12), emerald(0.9)),
    }
}
