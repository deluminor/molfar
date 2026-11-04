//! Home: the personal dashboard opened first from navigation.
mod card;
mod drag;
mod edit;
mod grid;
pub(crate) mod layout;
mod motion;
mod reflow;
#[cfg(test)]
mod tests;
mod view;
mod widgets;

use crate::popover::AnchorSlot;
use gpui::{Context, EventEmitter, FocusHandle, Focusable};
use layout::state::LayoutState;
use serde_json::Value;

pub(crate) enum Event {
    Close,
    Layout(Value),
}

pub(crate) struct Home {
    focus: FocusHandle,
    state: LayoutState,
    frame: AnchorSlot,
    entrance: u32,
    editing: bool,
    grid: Option<layout::geometry::Grid>,
    drag: Option<drag::Drag>,
    reflow: reflow::Reflow,
}

impl EventEmitter<Event> for Home {}

impl Focusable for Home {
    fn focus_handle(&self, _: &gpui::App) -> FocusHandle {
        self.focus.clone()
    }
}

impl Home {
    pub(crate) fn new(stored: &Value, cx: &mut Context<Self>) -> Home {
        Home {
            focus: cx.focus_handle(),
            state: LayoutState::parse(stored),
            frame: AnchorSlot::default(),
            entrance: 0,
            editing: false,
            grid: None,
            drag: None,
            reflow: reflow::Reflow::default(),
        }
    }

    /// Replays the staggered entrance each time Home is brought forward.
    pub(crate) fn reveal(&mut self, cx: &mut Context<Self>) {
        self.entrance = self.entrance.wrapping_add(1);
        cx.notify();
    }

    fn save(&mut self, cx: &mut Context<Self>) {
        cx.emit(Event::Layout(self.state.to_value()));
        cx.notify();
    }
}
