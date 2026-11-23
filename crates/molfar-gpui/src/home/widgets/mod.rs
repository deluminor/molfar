mod activity;
mod automations;
mod consumption;
mod host;
mod inbox;
pub(crate) mod parts;
mod sessions;
mod status;
mod usage;

use super::{Home, layout::model::WidgetId};
use crate::host_pane::HostPane;
use gpui::{AnyElement, AppContext, Context, Entity, StyleRefinement, div, prelude::*};
use std::collections::HashMap;

/// Content box of a card, below its caption.
#[derive(Clone, Copy, Debug, PartialEq)]
pub(crate) struct Body {
    pub w: f32,
    pub h: f32,
}

/// Cached panes for the data widgets. The clock, brand and matrix animate
/// on the shared clock, and every tick renders Home; data widgets kept in
/// their own views are reused instead of laid out again.
pub(super) struct Panes {
    panes: HashMap<WidgetId, Entity<HostPane<Home>>>,
    bodies: HashMap<WidgetId, Body>,
}

impl Panes {
    pub(super) fn new(cx: &mut Context<Home>) -> Self {
        let host = cx.entity();
        let panes = WidgetId::ALL
            .into_iter()
            .filter(|id| !animated(*id))
            .map(|id| {
                let pane = cx.new(|cx| {
                    HostPane::new(
                        &host,
                        move |home, _, cx| {
                            let body = home.panes.bodies.get(&id).copied();
                            body.map_or_else(
                                || div().into_any_element(),
                                |body| home.data_widget(id, body, cx),
                            )
                        },
                        cx,
                    )
                });
                (id, pane)
            })
            .collect();

        Self {
            panes,
            bodies: HashMap::new(),
        }
    }
}

#[cfg(test)]
impl Panes {
    pub(in crate::home) fn renders(&self, cx: &gpui::App) -> usize {
        self.panes.values().map(|pane| pane.read(cx).renders).sum()
    }

    pub(in crate::home) fn entities(&self) -> Vec<Entity<HostPane<Home>>> {
        self.panes.values().cloned().collect()
    }
}

fn animated(id: WidgetId) -> bool {
    matches!(id, WidgetId::Clock | WidgetId::Brand | WidgetId::Matrix)
}

impl Home {
    pub(super) fn widget(&mut self, id: WidgetId, body: Body) -> AnyElement {
        let cached = StyleRefinement::default().size_full();
        match id {
            WidgetId::Clock => self.views.clock.clone().cached(cached).into_any_element(),
            WidgetId::Brand => self.views.brand.clone().cached(cached).into_any_element(),
            WidgetId::Matrix => self.views.matrix.clone().cached(cached).into_any_element(),
            _ => {
                self.panes.bodies.insert(id, body);
                match self.panes.panes.get(&id) {
                    Some(pane) => pane.clone().cached(cached).into_any_element(),
                    None => div().into_any_element(),
                }
            }
        }
    }

    fn data_widget(&self, id: WidgetId, body: Body, cx: &mut Context<Self>) -> AnyElement {
        match id {
            WidgetId::Status => self.status_widget(body, cx),
            WidgetId::Host => self.host_widget(body, cx),
            WidgetId::Usage => self.usage_widget(body, cx),
            WidgetId::Consumption => self.consumption_widget(body, cx),
            WidgetId::Inbox => self.inbox_widget(body, cx),
            WidgetId::Activity => self.activity_widget(body, cx),
            WidgetId::Sessions => self.sessions_widget(body, cx),
            WidgetId::Automations => self.automations_widget(body, cx),
            WidgetId::Clock | WidgetId::Brand | WidgetId::Matrix => div().into_any_element(),
        }
    }

    /// Caption extras beside the title, before the edit-mode hide control.
    pub(super) fn widget_actions(
        &self,
        id: WidgetId,
        cx: &mut Context<Self>,
    ) -> Option<AnyElement> {
        match id {
            WidgetId::Inbox => self.inbox_badge(cx),
            WidgetId::Consumption => Some(self.consumption_actions(cx)),
            _ => None,
        }
    }
}
