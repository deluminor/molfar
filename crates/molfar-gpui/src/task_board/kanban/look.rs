use gpui::{Hsla, hsla};
use molfar_core::task_board::constants::{
    BACKLOG, CODE_REVIEW, DONE, FINAL_REVIEW, GRILL, IMPLEMENT, PLAN_APPROVAL, REWORK,
};

pub(super) const COLUMN_WIDTH: f32 = 288.;
pub(super) const COLUMN_RADIUS: f32 = 16.;
pub(super) const CARD_RADIUS: f32 = 12.;

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

pub(super) const DRAWER_WIDTH: f32 = 460.;
pub(super) const DRAWER_SLIDE: std::time::Duration = std::time::Duration::from_millis(200);
pub(super) const DRAWER_SHIFT: f32 = 32.;
