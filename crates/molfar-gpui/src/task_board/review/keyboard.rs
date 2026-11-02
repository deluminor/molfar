use super::{super::Board, Mode};
use gpui::{Context, KeyDownEvent, Window};

impl Board {
    pub(super) fn owner_review_key(
        &mut self,
        event: &KeyDownEvent,
        window: &mut Window,
        cx: &mut Context<Self>,
    ) {
        let Some(panel) = &self.review else { return };
        if panel.composing(window, cx) {
            return;
        }
        let key = event.keystroke.key.as_str();
        if key == "enter"
            && (event.keystroke.modifiers.platform || event.keystroke.modifiers.control)
        {
            self.submit_owner_review(false, cx);
        } else if key == "escape" {
            self.close_owner_review(window, cx);
        } else if key == "tab" {
            let handles = panel.handles(cx);
            let current = handles
                .iter()
                .position(|focus| focus.is_focused(window))
                .unwrap_or(handles.len() - 1);
            let next = if event.keystroke.modifiers.shift {
                (current + handles.len() - 1) % handles.len()
            } else {
                (current + 1) % handles.len()
            };
            window.focus(&handles[next], cx);
        } else if key == "enter" || key == "space" {
            if panel.cancel_focus.is_focused(window) {
                self.close_owner_review(window, cx);
            } else if panel.reload_required && panel.reload_focus.is_focused(window) {
                self.load_owner_review(cx);
            } else if panel.submit_focus.is_focused(window) {
                if panel.data.is_none() {
                    self.load_owner_review(cx);
                } else {
                    self.submit_owner_review(false, cx);
                }
            } else if panel.mode == Mode::Questions && panel.changes_focus.is_focused(window) {
                self.submit_owner_review(true, cx);
            } else {
                return;
            }
        } else {
            return;
        }
        cx.stop_propagation();
    }
}
