//! User-sized file tree and note panel. Widths persist beside the vault
//! connection and are clamped to the window on every drag.
use super::Knowledge;
use crate::theme::*;
use gpui::{
    AnyElement, Context, CursorStyle, MouseButton, MouseDownEvent, MouseMoveEvent, Role, Window,
    div, prelude::*, px,
};
use serde::{Deserialize, Serialize};
use std::path::Path;

const FILE: &str = "knowledge-panes.json";
const TREE: (f32, f32, f32) = (264., 200., 520.);
const PANEL: (f32, f32, f32) = (460., 340., 960.);
/// Neither side may take more of the window than this.
const VIEWPORT_SHARE: (f32, f32) = (0.4, 0.6);
/// The graph keeps at least this much room between the two.
const GRAPH_MIN: f32 = 240.;

#[derive(Clone, Copy, Debug, PartialEq, Serialize, Deserialize)]
#[serde(default, rename_all = "camelCase")]
pub(crate) struct PaneWidths {
    pub tree: f32,
    pub panel: f32,
}

impl Default for PaneWidths {
    fn default() -> Self {
        Self {
            tree: TREE.0,
            panel: PANEL.0,
        }
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub(crate) enum Side {
    Tree,
    Panel,
}

#[derive(Clone, Copy, Debug)]
pub(crate) struct Resize {
    side: Side,
    start_x: f32,
    start_width: f32,
}

impl PaneWidths {
    /// Clamps one side to its bounds, its viewport share and the graph's room.
    pub(crate) fn resized(self, side: Side, width: f32, viewport: f32) -> Self {
        let (_, min, max) = if side == Side::Tree { TREE } else { PANEL };
        let share = if side == Side::Tree {
            VIEWPORT_SHARE.0
        } else {
            VIEWPORT_SHARE.1
        };
        let other = if side == Side::Tree {
            self.panel
        } else {
            self.tree
        };
        let limit = max
            .min(viewport * share)
            .min(viewport - other - GRAPH_MIN)
            .max(min);
        let width = width.clamp(min, limit);
        match side {
            Side::Tree => Self {
                tree: width,
                ..self
            },
            Side::Panel => Self {
                panel: width,
                ..self
            },
        }
    }
}

pub(crate) fn load(data_dir: &Path) -> PaneWidths {
    let Ok(text) = std::fs::read_to_string(data_dir.join(FILE)) else {
        return PaneWidths::default();
    };
    serde_json::from_str(&text).unwrap_or_else(|error| {
        log::warn!("knowledge pane widths unreadable, using defaults: {error}");
        PaneWidths::default()
    })
}

pub(crate) fn save(data_dir: &Path, widths: PaneWidths) -> Result<(), String> {
    let text = serde_json::to_string(&widths).map_err(|error| error.to_string())?;
    std::fs::write(data_dir.join(FILE), text).map_err(|error| error.to_string())
}

impl Knowledge {
    pub(super) fn resize_handle(&self, side: Side, cx: &mut Context<Self>) -> AnyElement {
        let id = if side == Side::Tree {
            "knowledge-resize-tree"
        } else {
            "knowledge-resize-panel"
        };
        let active = self.resize.is_some_and(|resize| resize.side == side);
        div()
            .id(id)
            .debug_selector(move || id.to_string())
            .role(Role::Splitter)
            .aria_label(if side == Side::Tree {
                "Resize file tree"
            } else {
                "Resize note panel"
            })
            .absolute()
            .top_0()
            .bottom_0()
            .right(px(-3.))
            .w(px(6.))
            .cursor(CursorStyle::ResizeLeftRight)
            .when(active, |handle| handle.bg(accent_color().opacity(0.5)))
            .hover(|style| style.bg(accent_color().opacity(0.35)))
            .on_mouse_down(
                MouseButton::Left,
                cx.listener(move |this, event: &MouseDownEvent, _, cx| {
                    if event.click_count == 2 {
                        let fallback = PaneWidths::default();
                        match side {
                            Side::Tree => this.widths.tree = fallback.tree,
                            Side::Panel => this.widths.panel = fallback.panel,
                        }
                        this.persist_widths(cx);
                    } else {
                        this.resize = Some(Resize {
                            side,
                            start_x: f32::from(event.position.x),
                            start_width: match side {
                                Side::Tree => this.widths.tree,
                                Side::Panel => this.widths.panel,
                            },
                        });
                    }
                    cx.stop_propagation();
                    cx.notify();
                }),
            )
            .into_any_element()
    }

    pub(super) fn drag_resize(
        &mut self,
        event: &MouseMoveEvent,
        window: &Window,
        cx: &mut Context<Self>,
    ) {
        let Some(resize) = self.resize else {
            return;
        };
        if event.pressed_button != Some(MouseButton::Left) {
            self.end_resize(cx);
            return;
        }
        let moved = f32::from(event.position.x) - resize.start_x;
        let width = match resize.side {
            Side::Tree => resize.start_width + moved,
            Side::Panel => resize.start_width + moved,
        };
        let viewport = f32::from(window.viewport_size().width);
        self.widths = self.widths.resized(resize.side, width, viewport);
        cx.notify();
    }

    pub(super) fn end_resize(&mut self, cx: &mut Context<Self>) {
        if self.resize.take().is_some() {
            self.persist_widths(cx);
            cx.notify();
        }
    }

    fn persist_widths(&mut self, cx: &mut Context<Self>) {
        let widths = self.widths;
        let data_dir = self.service.read(cx).data_dir().to_path_buf();
        cx.background_executor()
            .spawn(async move {
                if let Err(error) = save(&data_dir, widths) {
                    log::warn!("knowledge pane widths not saved: {error}");
                }
            })
            .detach();
    }

    pub(super) fn restore_widths(&mut self, cx: &mut Context<Self>) {
        let data_dir = self.service.read(cx).data_dir().to_path_buf();
        let load = cx
            .background_executor()
            .spawn(async move { load(&data_dir) });
        cx.spawn(async move |this, cx| {
            let widths = load.await;
            let _ = this.update(cx, |this, cx| {
                if this.resize.is_none() {
                    this.widths = widths;
                    cx.notify();
                }
            });
        })
        .detach();
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn widths_clamp_to_bounds_viewport_share_and_graph_room() {
        let widths = PaneWidths::default();
        assert_eq!(widths.resized(Side::Tree, 50., 1600.).tree, 200.);
        assert_eq!(widths.resized(Side::Tree, 900., 1600.).tree, 520.);
        assert_eq!(
            widths.resized(Side::Tree, 900., 1000.).tree,
            1000. - 460. - 240.
        );
        assert!((widths.resized(Side::Panel, 2000., 1400.).panel - 840.).abs() < 0.01);
        let narrow = widths.resized(Side::Panel, 800., 1000.);
        assert_eq!(narrow.panel, 1000. - 264. - 240.);
    }

    #[test]
    fn widths_round_trip_and_bad_files_fall_back() {
        let dir = std::env::temp_dir().join(format!("molfar-panes-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(&dir).unwrap();
        assert_eq!(load(&dir), PaneWidths::default());
        let widths = PaneWidths {
            tree: 300.,
            panel: 520.,
        };
        save(&dir, widths).unwrap();
        assert_eq!(load(&dir), widths);
        std::fs::write(dir.join(FILE), "not json").unwrap();
        assert_eq!(load(&dir), PaneWidths::default());
        std::fs::remove_dir_all(&dir).unwrap();
    }
}
