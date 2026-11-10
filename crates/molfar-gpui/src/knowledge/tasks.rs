//! Checkbox clicks in the preview write the note at once, like Obsidian.
use super::Knowledge;
use gpui::Context;
use molfar_core::knowledge::toggle_task;

impl Knowledge {
    pub(super) fn toggle_task(&mut self, ordinal: usize, cx: &mut Context<Self>) {
        let Some(path) = self.selected.clone() else {
            return;
        };
        self.stash(cx);
        let Some(text) = self.drafts.get(&path).map(|draft| draft.text.clone()) else {
            return;
        };
        let Some(toggled) = toggle_task(&text, ordinal) else {
            log::warn!("knowledge task {ordinal} not found in {path}");
            return;
        };
        if let Some(draft) = self.drafts.get_mut(&path) {
            draft.text = toggled.clone();
        }
        self.show_text(&toggled, cx);
        self.prepare(&path, cx);
        self.save(cx);
        cx.notify();
    }
}
