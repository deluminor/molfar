use super::{
    Home,
    layout::{
        compact::{compact, move_to, resize_to},
        geometry::Rect,
        model::{Item, WidgetId},
    },
};
use gpui::{Context, Pixels, Point};

const MIN_PIXELS: f32 = 48.;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub(crate) enum Gesture {
    Move,
    Resize,
}

pub(crate) struct Drag {
    pub id: WidgetId,
    pub gesture: Gesture,
    start: Point<Pixels>,
    origin: Rect,
    base: Vec<Item>,
    pub preview: Vec<Item>,
    pub frame: Rect,
}

impl Home {
    pub(super) fn begin_drag(
        &mut self,
        id: WidgetId,
        gesture: Gesture,
        position: Point<Pixels>,
        cx: &mut Context<Self>,
    ) {
        let Some(grid) = self.grid.filter(|_| self.editing) else {
            return;
        };
        let base = self.state.visible();
        let Some(item) = base.iter().find(|item| item.id == id) else {
            return;
        };
        let origin = grid.rect(item);
        self.drag = Some(Drag {
            id,
            gesture,
            start: position,
            origin,
            preview: base.clone(),
            base,
            frame: origin,
        });
        cx.stop_propagation();
        cx.notify();
    }

    pub(super) fn drag_to(&mut self, position: Point<Pixels>, cx: &mut Context<Self>) {
        let (Some(drag), Some(grid)) = (&mut self.drag, self.grid) else {
            return;
        };
        let dx = (position.x - drag.start.x).to_f64() as f32;
        let dy = (position.y - drag.start.y).to_f64() as f32;
        let origin = drag.origin;

        match drag.gesture {
            Gesture::Move => {
                drag.frame = Rect {
                    x: origin.x + dx,
                    y: origin.y + dy,
                    ..origin
                };
                let (x, y) = grid.cell(drag.frame.x, drag.frame.y);
                drag.preview = move_to(&drag.base, drag.id, x, y);
            }
            Gesture::Resize => {
                drag.frame = Rect {
                    w: (origin.w + dx).max(MIN_PIXELS),
                    h: (origin.h + dy).max(MIN_PIXELS),
                    ..origin
                };
                let (w, h) = grid.span(drag.frame.w, drag.frame.h);
                drag.preview = resize_to(&drag.base, drag.id, w, h);
            }
        }
        cx.notify();
    }

    pub(super) fn end_drag(&mut self, cx: &mut Context<Self>) {
        let Some(drag) = self.drag.take() else {
            return;
        };
        let settled = compact(&drag.preview, None);
        if let Some(item) = settled.iter().find(|item| item.id == drag.id)
            && !cx.reduce_motion()
        {
            let now = cx.background_executor().now();
            self.reflow.land(*item, drag.frame, now);
        }
        if settled != drag.base {
            self.state.apply(&settled);
            self.save(cx);
        }
        cx.notify();
    }

    pub(super) fn cancel_drag(&mut self, cx: &mut Context<Self>) -> bool {
        let Some(drag) = self.drag.take() else {
            return false;
        };
        if let Some(item) = drag.base.iter().find(|item| item.id == drag.id)
            && !cx.reduce_motion()
        {
            let now = cx.background_executor().now();
            self.reflow.land(*item, drag.frame, now);
        }
        cx.notify();
        true
    }
}
