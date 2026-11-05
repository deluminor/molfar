use super::model::{COLUMNS, GAP, Item, ROW_HEIGHT};

#[derive(Clone, Copy, Debug, PartialEq)]
pub(crate) struct Rect {
    pub x: f32,
    pub y: f32,
    pub w: f32,
    pub h: f32,
}

/// Pixel frame of the 12-column grid inside a content box `width` wide.
#[derive(Clone, Copy, Debug, PartialEq)]
pub(crate) struct Grid {
    pub column: f32,
}

impl Grid {
    pub(crate) fn new(width: f32) -> Grid {
        let columns = f32::from(COLUMNS);
        Grid {
            column: ((width - GAP * (columns - 1.)) / columns).max(1.),
        }
    }

    pub(crate) fn rect(&self, item: &Item) -> Rect {
        let span = |cells: u16, cell: f32| {
            f32::from(cells) * cell + f32::from(cells.saturating_sub(1)) * GAP
        };
        Rect {
            x: f32::from(item.x) * (self.column + GAP),
            y: f32::from(item.y) * (ROW_HEIGHT + GAP),
            w: span(item.w, self.column),
            h: span(item.h, ROW_HEIGHT),
        }
    }

    pub(crate) fn height(&self, items: &[Item]) -> f32 {
        let rows = items.iter().map(Item::bottom).max().unwrap_or(0);
        if rows == 0 {
            return 0.;
        }
        f32::from(rows) * ROW_HEIGHT + f32::from(rows - 1) * GAP
    }

    /// Grid cell under a pixel offset, rounded to the nearest cell edge.
    pub(crate) fn cell(&self, x: f32, y: f32) -> (i32, i32) {
        (
            (x / (self.column + GAP)).round() as i32,
            (y / (ROW_HEIGHT + GAP)).round() as i32,
        )
    }

    /// Size in cells for a pixel size, rounded to the nearest whole cell.
    pub(crate) fn span(&self, w: f32, h: f32) -> (i32, i32) {
        (
            ((w + GAP) / (self.column + GAP)).round() as i32,
            ((h + GAP) / (ROW_HEIGHT + GAP)).round() as i32,
        )
    }
}
