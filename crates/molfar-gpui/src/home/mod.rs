//! Home: the personal dashboard opened first from navigation.
mod card;
pub(crate) mod data;
mod drag;
mod edit;
mod grid;
pub(crate) mod layout;
mod motion;
mod reflow;
#[cfg(test)]
mod sphere_tests;
#[cfg(test)]
mod tests;
mod view;
mod visuals;
#[cfg(test)]
mod widget_tests;
mod widgets;

use crate::popover::AnchorSlot;
use gpui::{AppContext, Context, EventEmitter, FocusHandle, Focusable};
use layout::state::LayoutState;
use serde_json::Value;
use std::{cell::RefCell, rc::Rc};

pub(crate) enum Event {
    Close,
    Layout(Value),
    OpenSession(i64),
    OpenAutomation(String),
    OpenInbox(Option<String>),
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
    sources: data::feeds::Sources,
    feeds: data::feeds::Feeds,
    visible: bool,
    _poll: Option<gpui::Task<()>>,
    _inbox: Option<gpui::Subscription>,
    views: Views,
}

struct Views {
    sphere_motion: Rc<RefCell<visuals::sphere_motion::Motion>>,
    clock: gpui::Entity<visuals::clock::ClockView>,
    brand: gpui::Entity<visuals::brand::BrandView>,
    matrix: gpui::Entity<visuals::matrix::MatrixView>,
}

impl EventEmitter<Event> for Home {}

impl Focusable for Home {
    fn focus_handle(&self, _: &gpui::App) -> FocusHandle {
        self.focus.clone()
    }
}

impl Home {
    pub(crate) fn new(stored: &Value, cx: &mut Context<Self>) -> Home {
        let state = LayoutState::parse(stored);
        let brand = state.brand;
        let sphere_motion = Rc::new(RefCell::new(visuals::sphere_motion::Motion::default()));
        let views = Views {
            clock: cx.new(visuals::clock::ClockView::new),
            brand: cx.new(|_| visuals::brand::BrandView::new(brand, sphere_motion.clone())),
            sphere_motion,
            matrix: cx.new(|_| visuals::matrix::MatrixView),
        };
        Home {
            focus: cx.focus_handle(),
            state,
            frame: AnchorSlot::default(),
            entrance: 0,
            editing: false,
            grid: None,
            drag: None,
            reflow: reflow::Reflow::default(),
            sources: Default::default(),
            feeds: Default::default(),
            visible: false,
            _poll: None,
            _inbox: None,
            views,
        }
    }

    /// Replays the staggered entrance each time Home is brought forward.
    pub(crate) fn reveal(&mut self, cx: &mut Context<Self>) {
        self.visible = true;
        self.views.sphere_motion.borrow_mut().resume();
        self.entrance = self.entrance.wrapping_add(1);
        self.refresh_records(cx);
        cx.notify();
    }

    /// Stops polling while another page covers Home.
    pub(crate) fn conceal(&mut self) {
        self.visible = false;
        self.views.sphere_motion.borrow_mut().pause();
        self.feeds.host.reset_baseline = true;
        self.drag = None;
    }

    fn save(&mut self, cx: &mut Context<Self>) {
        cx.emit(Event::Layout(self.state.to_value()));
        cx.notify();
    }
}
