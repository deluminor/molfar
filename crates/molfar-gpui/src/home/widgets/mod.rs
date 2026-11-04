use super::{Home, card, layout::model::WidgetId};
use gpui::{AnyElement, Context, Window, prelude::*};

impl Home {
    pub(super) fn widget(
        &self,
        id: WidgetId,
        _window: &Window,
        _cx: &mut Context<Self>,
    ) -> AnyElement {
        card::note(id.label()).into_any_element()
    }
}
