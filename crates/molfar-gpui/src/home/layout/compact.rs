use super::model::{COLUMNS, Item, WidgetId};

/// Floats every card up as far as it can go, top-left first. A `pinned` card
/// keeps its row so a drag or resize target never jumps away from the pointer.
pub(crate) fn compact(items: &[Item], pinned: Option<WidgetId>) -> Vec<Item> {
    let mut placed: Vec<Item> = items
        .iter()
        .filter(|item| Some(item.id) == pinned)
        .copied()
        .collect();
    let mut rest: Vec<Item> = items
        .iter()
        .filter(|item| Some(item.id) != pinned)
        .copied()
        .collect();
    rest.sort_by_key(|item| (item.y, item.x));

    for mut item in rest {
        item.y = 0;
        while let Some(blocker) = placed.iter().find(|other| other.overlaps(&item)) {
            item.y = blocker.bottom();
        }
        placed.push(item);
    }

    let order = |id: WidgetId| items.iter().position(|item| item.id == id);
    placed.sort_by_key(|item| order(item.id));
    placed
}

pub(crate) fn move_to(items: &[Item], id: WidgetId, x: i32, y: i32) -> Vec<Item> {
    let moved = items.iter().map(|item| {
        if item.id != id {
            return *item;
        }
        let x = x.clamp(0, i32::from(COLUMNS - item.w)) as u16;
        Item {
            x,
            y: y.max(0) as u16,
            ..*item
        }
    });
    compact(&moved.collect::<Vec<_>>(), Some(id))
}

pub(crate) fn resize_to(items: &[Item], id: WidgetId, w: i32, h: i32) -> Vec<Item> {
    let resized = items.iter().map(|item| {
        if item.id != id {
            return *item;
        }
        let (min_w, min_h) = item.id.min_size();
        let w = w.clamp(i32::from(min_w), i32::from(COLUMNS - item.x)) as u16;
        Item {
            w,
            h: h.max(i32::from(min_h)) as u16,
            ..*item
        }
    });
    compact(&resized.collect::<Vec<_>>(), Some(id))
}
