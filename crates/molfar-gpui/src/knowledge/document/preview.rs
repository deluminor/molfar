//! The note preview as a virtualized list: properties, then the note's
//! top-level blocks, so scrolling and redraws lay out only what is visible.
use super::{super::Knowledge, PreviewBlock, PreviewHost, PreviewItems, properties};
use gpui::{AnyElement, Context, ListOffset, div, list, prelude::*, px};

/// The properties card before the blocks and a bottom margin after them.
const FRAME_ITEMS: usize = 2;

impl PreviewHost for Knowledge {
    const TOGGLE_TASK: Option<super::note::blocks::ToggleTask<Self>> = Some(Knowledge::toggle_task);

    fn callout_open(&self, index: usize) -> bool {
        self.callouts_toggled.contains(&index)
    }

    fn toggle_callout(&mut self, index: usize) {
        if !self.callouts_toggled.remove(&index) {
            self.callouts_toggled.insert(index);
        }
    }
}

impl Knowledge {
    /// Swaps in a freshly parsed note. Re-parsing the open note keeps its
    /// place; another note starts at the top.
    pub(in crate::knowledge) fn show_preview(
        &mut self,
        path: Option<&str>,
        blocks: Vec<PreviewBlock>,
    ) {
        let kept = (path.is_some() && path == self.note_path.as_deref())
            .then(|| self.note_list.logical_scroll_top());
        self.note = PreviewItems::new(blocks);
        let count = self.note.len() + FRAME_ITEMS;
        self.note_list.reset(count);
        if let Some(top) = kept {
            self.note_list.scroll_to(ListOffset {
                item_ix: top.item_ix.min(count - 1),
                offset_in_item: top.offset_in_item,
            });
        }
        self.note_path = path.map(str::to_owned);
    }

    pub(super) fn preview_body(&self, cx: &mut Context<Self>) -> AnyElement {
        let entity = cx.entity();
        list(self.note_list.clone(), move |index, _, cx| {
            entity.update(cx, |this, cx| this.preview_item(index, cx))
        })
        .size_full()
        .into_any_element()
    }

    fn preview_item(&self, index: usize, cx: &mut Context<Self>) -> AnyElement {
        let item = div().px_6();
        if index == 0 {
            return item
                .pt_5()
                .children(properties::card(&self.properties))
                .into_any_element();
        }
        if index > self.note.len() {
            return item.h(px(32.)).into_any_element();
        }

        item.child(self.note.render(self, index - 1, cx))
            .into_any_element()
    }
}
