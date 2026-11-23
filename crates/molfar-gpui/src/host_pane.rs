//! A slice of a host view's render kept in its own cached view. GPUI renders
//! every ancestor of a notified view, so a heavy slice placed here is reused
//! when a sibling caused the frame (an animation, another pane's scroll) and
//! renders again whenever the host itself notifies.
use gpui::{
    AnyElement, Context, Entity, IntoElement, ParentElement, Render, Styled, Subscription,
    WeakEntity, Window, div,
};

type Slice<T> = Box<dyn Fn(&mut T, &mut Window, &mut Context<T>) -> AnyElement>;

pub(crate) struct HostPane<T: 'static> {
    host: WeakEntity<T>,
    slice: Slice<T>,
    _host: Subscription,
    #[cfg(test)]
    pub(crate) renders: usize,
}

impl<T: 'static> HostPane<T> {
    /// Build panes with the host, outside any frame: an entity created during
    /// a draw is missing from the accessed set its cached view records, so its
    /// own notify would never reach the window afterwards.
    pub(crate) fn new(
        host: &Entity<T>,
        slice: impl Fn(&mut T, &mut Window, &mut Context<T>) -> AnyElement + 'static,
        cx: &mut Context<Self>,
    ) -> Self {
        Self {
            host: host.downgrade(),
            slice: Box::new(slice),
            // A cached child is not dirtied by its parent's notify.
            _host: cx.observe(host, |_, _, cx| cx.notify()),
            #[cfg(test)]
            renders: 0,
        }
    }
}

impl<T: 'static> Render for HostPane<T> {
    fn render(&mut self, window: &mut Window, cx: &mut Context<Self>) -> impl IntoElement {
        #[cfg(test)]
        {
            self.renders += 1;
        }
        let slice = &self.slice;
        let body = self
            .host
            .update(cx, |host, cx| slice(host, window, cx))
            .unwrap_or_else(|_| gpui::Empty.into_any_element());

        // A cached view lays its content out as a root, so the slice gets the
        // flex column its inline parent gave it and `flex_1` keeps working.
        div().size_full().flex().flex_col().child(body)
    }
}
