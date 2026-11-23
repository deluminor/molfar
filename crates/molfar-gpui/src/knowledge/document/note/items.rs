//! A parsed note flattened into top-level items, so a `list` lays out only
//! what is on screen. Each item starts from the walk counters the blocks
//! before it would have left, which keeps task ordinals and callout indices
//! identical to a full render.
use super::{PreviewBlock, Walk, hosted, list::tasks_in};
use crate::knowledge::PreviewHost;
use gpui::{AnyElement, Context, div, prelude::*};

/// Element ids inside one item stay unique while items render on demand.
const IDS_PER_ITEM: usize = 10_000;

struct Item {
    block: usize,
    top: usize,
    start: Walk,
}

#[derive(Default)]
pub(crate) struct PreviewItems {
    blocks: Vec<PreviewBlock>,
    items: Vec<Item>,
}

impl PreviewItems {
    pub(crate) fn new(blocks: Vec<PreviewBlock>) -> Self {
        let mut walk = Walk::default();
        let mut items = Vec::new();
        for (index, block) in blocks.iter().enumerate() {
            if let PreviewBlock::Markdown(tree) = block {
                for (top, entry) in tree.blocks.iter().enumerate() {
                    items.push(Item {
                        block: index,
                        top,
                        start: walk,
                    });
                    walk.tasks += tasks_in(&entry.block);
                }
                continue;
            }
            items.push(Item {
                block: index,
                top: 0,
                start: walk,
            });
            let (callouts, tasks) = counts(block);
            walk.callouts += callouts;
            walk.tasks += tasks;
        }

        Self { blocks, items }
    }

    #[cfg(test)]
    pub(crate) fn blocks(&self) -> &[PreviewBlock] {
        &self.blocks
    }

    pub(crate) fn len(&self) -> usize {
        self.items.len()
    }

    pub(crate) fn is_empty(&self) -> bool {
        self.items.is_empty()
    }

    pub(crate) fn render<T: PreviewHost>(
        &self,
        host: &T,
        index: usize,
        cx: &mut Context<T>,
    ) -> AnyElement {
        let Some((item, block)) = self
            .items
            .get(index)
            .and_then(|item| Some((item, self.blocks.get(item.block)?)))
        else {
            return div().into_any_element();
        };
        let mut walk = Walk {
            ids: (index + 1) * IDS_PER_ITEM,
            ..item.start
        };

        hosted::top_element(host, block, item.top, index == 0, &mut walk, cx)
    }
}

/// Callouts and tasks a block adds to the walk, nested bodies included.
fn counts(block: &PreviewBlock) -> (usize, usize) {
    match block {
        PreviewBlock::Markdown(tree) => {
            (0, tree.blocks.iter().map(|top| tasks_in(&top.block)).sum())
        }
        PreviewBlock::Callout { body, .. } => body.iter().map(counts).fold(
            (1, 0),
            |(callouts, tasks), (more_callouts, more_tasks)| {
                (callouts + more_callouts, tasks + more_tasks)
            },
        ),
        PreviewBlock::Image { .. } => (0, 0),
    }
}
