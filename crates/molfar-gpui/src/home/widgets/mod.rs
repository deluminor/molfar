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
use gpui::{AnyElement, Context, Window, prelude::*};

/// Content box of a card, below its caption.
#[derive(Clone, Copy, Debug, PartialEq)]
pub(crate) struct Body {
    pub w: f32,
    pub h: f32,
}

impl Home {
    pub(super) fn widget(
        &self,
        id: WidgetId,
        body: Body,
        _window: &Window,
        cx: &mut Context<Self>,
    ) -> AnyElement {
        match id {
            WidgetId::Clock => self.views.clock.clone().into_any_element(),
            WidgetId::Status => self.status_widget(body, cx),
            WidgetId::Brand => self.views.brand.clone().into_any_element(),
            WidgetId::Host => self.host_widget(body, cx),
            WidgetId::Usage => self.usage_widget(body, cx),
            WidgetId::Consumption => self.consumption_widget(body, cx),
            WidgetId::Inbox => self.inbox_widget(body, cx),
            WidgetId::Activity => self.activity_widget(body, cx),
            WidgetId::Sessions => self.sessions_widget(body, cx),
            WidgetId::Automations => self.automations_widget(body, cx),
            WidgetId::Matrix => self.views.matrix.clone().into_any_element(),
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
