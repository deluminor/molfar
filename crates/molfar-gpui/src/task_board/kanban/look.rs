use gpui::{Hsla, hsla};
use molfar_core::task_board::constants::{
    BACKLOG, CODE_REVIEW, DONE, FINAL_REVIEW, GRILL, IMPLEMENT, PLAN_APPROVAL, REWORK,
};

pub(super) const COLUMN_WIDTH: f32 = 288.;
pub(super) const COLUMN_RADIUS: f32 = 16.;
pub(super) const CARD_RADIUS: f32 = 12.;
pub(super) const CARD_PAD_Y: f32 = 10.;
pub(super) const CARD_PAD_LEFT: f32 = 14.;
pub(super) const CARD_PAD_RIGHT: f32 = 12.;

/// Queue waits to start, agent runs a session, gate waits on the owner, terminal is finished.
#[derive(Clone, Copy, PartialEq, Eq)]
pub(super) enum Kind {
    Queue,
    Agent,
    Gate,
    Terminal,
}

pub(super) fn amber(alpha: f32) -> Hsla {
    hsla(46. / 360., 0.97, 0.65, alpha)
}

pub(super) fn emerald(alpha: f32) -> Hsla {
    hsla(158. / 360., 0.64, 0.52, alpha)
}

pub(super) fn rose(alpha: f32) -> Hsla {
    hsla(351. / 360., 0.95, 0.71, alpha)
}

pub(super) fn look(column: &str) -> (&'static str, Kind) {
    match column {
        BACKLOG => ("inbox", Kind::Queue),
        GRILL => ("sparkles", Kind::Agent),
        PLAN_APPROVAL => ("check-circle", Kind::Gate),
        IMPLEMENT => ("terminal", Kind::Agent),
        CODE_REVIEW => ("git-compare", Kind::Agent),
        FINAL_REVIEW => ("eye", Kind::Gate),
        REWORK => ("rotate-ccw", Kind::Agent),
        DONE => ("check-circle-2", Kind::Terminal),
        _ => ("circle-dashed-hi", Kind::Queue),
    }
}

/// Icon chip fill and ink per kind; colour always pairs with an icon and a word.
pub(super) fn kind_tone(kind: Kind) -> (Hsla, Hsla) {
    match kind {
        Kind::Queue => (crate::theme::content(0.07), crate::theme::content(0.6)),
        Kind::Agent => {
            let mut fill = crate::theme::accent_color();
            fill.a = 0.15;
            (fill, crate::theme::accent_color())
        }
        Kind::Gate => (amber(0.12), amber(1.)),
        Kind::Terminal => (emerald(0.12), emerald(0.9)),
    }
}

pub(super) fn empty_hint(column: &str) -> &'static str {
    match column {
        BACKLOG => "New tasks land here",
        GRILL => "Specs and plans get drafted here",
        PLAN_APPROVAL => "Plans wait here for you",
        IMPLEMENT => "Approved plans get built here",
        CODE_REVIEW => "Finished work gets reviewed here",
        FINAL_REVIEW => "Reviewed work waits here for you",
        REWORK => "Picked findings get fixed here",
        DONE => "Delivered cards rest here",
        _ => "Cards from a newer version",
    }
}

/// Who acts in columns no agent works: `(icon, lead, rest)`.
pub(super) fn note(column: &str) -> Option<(&'static str, &'static str, &'static str)> {
    match column {
        BACKLOG => Some(("queue-pause", "Not started", "drag to Grill to begin")),
        PLAN_APPROVAL => Some(("clock", "Your turn", "approve or request changes")),
        FINAL_REVIEW => Some(("clock", "Your turn", "deliver or send to rework")),
        DONE => Some(("git-pull-request", "Shipped", "as a PR, merge or branch")),
        _ => None,
    }
}

/// Rework cycles at or above this are flagged, as on desktop.
pub(super) const REWORK_WARNING_CYCLE: i64 = 3;

pub(super) const DRAWER_WIDTH: f32 = 520.;
pub(super) const DRAWER_SLIDE: std::time::Duration = std::time::Duration::from_millis(200);
pub(super) const DRAWER_SHIFT: f32 = 32.;

pub(super) const DIMMED: f32 = 0.45;
pub(super) const SOURCE_FADE: f32 = 0.4;
pub(super) const EDGE_ZONE: f32 = 56.;
pub(super) const MAX_SCROLL_STEP: f32 = 18.;
pub(super) const EDGE_FRAME: std::time::Duration = std::time::Duration::from_millis(16);
pub(super) const DRAG_FADE: std::time::Duration = std::time::Duration::from_millis(200);

/// What a drop on a column does, shown while dragging.
pub(super) fn drop_label(
    action: molfar_core::task_board::stage::transitions::types::BoardAction,
) -> &'static str {
    use molfar_core::task_board::stage::transitions::types::BoardAction::*;
    match action {
        Start => "Drop to start grill",
        ApprovePlan => "Drop to approve the plan",
        RequestChanges => "Drop to request plan changes",
        Rework => "Drop to pick findings for rework",
        Deliver => "Drop to choose a delivery",
        _ => "Drop to move back",
    }
}

/// Horizontal scroll speed while the pointer rests near a board edge; faster closer in.
pub(super) fn edge_scroll_step(x: f32, left: f32, right: f32) -> f32 {
    let from_left = x - left;
    let from_right = right - x;
    if from_left < EDGE_ZONE {
        return -(MAX_SCROLL_STEP * (1. - from_left.max(0.) / EDGE_ZONE)).ceil();
    }
    if from_right < EDGE_ZONE {
        return (MAX_SCROLL_STEP * (1. - from_right.max(0.) / EDGE_ZONE)).ceil();
    }
    0.
}
