//! Knowledge's screens: connect hero, full-page loaders and the workspace
//! (tree, note panel, then graph between header and footer).
use super::{Knowledge, loading};
use crate::theme::*;
use gpui::{AnyElement, Context, FontWeight, Role, div, prelude::*, px};
use molfar_core::knowledge::ConnectionState;

impl Knowledge {
    pub(super) fn hero(&self, reason: Option<String>, cx: &mut Context<Self>) -> AnyElement {
        div()
            .id("knowledge-empty")
            .debug_selector(|| "knowledge-empty".into())
            .size_full()
            .flex()
            .flex_col()
            .items_center()
            .justify_center()
            .gap_4()
            .child(
                div()
                    .size(px(64.))
                    .rounded_2xl()
                    .flex()
                    .items_center()
                    .justify_center()
                    .bg(accent_color().opacity(0.12))
                    .child(icon("folder-tree", 28.).text_color(accent_color())),
            )
            .child(
                div()
                    .text_size(px(20.))
                    .font_weight(FontWeight::SEMIBOLD)
                    .text_color(content(0.95))
                    .child("Connect your knowledge vault"),
            )
            .child(
                div()
                    .max_w(px(420.))
                    .text_center()
                    .text_size(px(13.))
                    .text_color(content(0.55))
                    .child("Choose an Obsidian or Markdown folder. MOLFAR indexes its notes and links locally and maps them as a 3D graph."),
            )
            .children(reason.map(|reason| {
                div()
                    .id("knowledge-reason")
                    .debug_selector(|| "knowledge-reason".into())
                    .max_w(px(420.))
                    .px_3()
                    .py_2()
                    .rounded_md()
                    .bg(gpui::hsla(0., 0.7, 0.6, 0.1))
                    .text_size(px(12.))
                    .text_color(gpui::hsla(0., 0.7, 0.65, 1.))
                    .child(reason)
            }))
            .child(
                div()
                    .id("knowledge-choose")
                    .debug_selector(|| "knowledge-choose".into())
                    .role(Role::Button)
                    .aria_label("Choose vault folder")
                    .cursor_pointer()
                    .h(px(34.))
                    .px_4()
                    .rounded_lg()
                    .flex()
                    .items_center()
                    .gap_2()
                    .bg(accent_color())
                    .text_color(white(1.))
                    .text_size(px(13.))
                    .font_weight(FontWeight::MEDIUM)
                    .hover(|style| style.opacity(0.9))
                    .child(icon("folder-open", 14.).text_color(white(1.)))
                    .child("Choose vault folder")
                    .on_click(cx.listener(|this, _, _, cx| this.choose(cx))),
            )
            .into_any_element()
    }

    pub(super) fn loading_screen(&self, caption: &str, detail: Option<String>) -> AnyElement {
        div()
            .id("knowledge-loading")
            .debug_selector(|| "knowledge-loading".into())
            .size_full()
            .flex()
            .items_center()
            .justify_center()
            .child(loading::orbit_loader(
                "knowledge-loading-orbit",
                caption.into(),
                detail,
            ))
            .into_any_element()
    }

    fn scene(&self, cx: &Context<Self>) -> AnyElement {
        let indexing = self.notes.is_empty() && self.indexing(cx);
        let centered = |selector: &'static str, child: AnyElement| {
            div()
                .debug_selector(move || selector.into())
                .flex_1()
                .min_w_0()
                .h_full()
                .flex()
                .items_center()
                .justify_center()
                .child(child)
                .into_any_element()
        };
        if indexing {
            let progress = self.service.read(cx).progress();
            return centered(
                "knowledge-scanning",
                loading::orbit_loader(
                    "knowledge-scan",
                    "Scanning your vault…".into(),
                    Some(format!("{progress} notes indexed")),
                ),
            );
        }
        if self.notes.is_empty() {
            return centered(
                "knowledge-no-notes",
                div()
                    .text_size(px(13.))
                    .text_color(content(0.45))
                    .child("This vault has no Markdown notes yet.")
                    .into_any_element(),
            );
        }
        div()
            .flex_1()
            .min_w_0()
            .h_full()
            .child(self.graph.clone())
            .into_any_element()
    }

    pub(super) fn workspace(
        &mut self,
        window: &mut gpui::Window,
        cx: &mut Context<Self>,
    ) -> AnyElement {
        let ConnectionState::Ready(connection) = self.state.clone() else {
            return div().into_any_element();
        };
        let skeleton = self.notes.is_empty() && self.indexing(cx);
        let panel = self.selected.clone().filter(|_| self.panel_open);
        let reveal = self.step_slide(window);

        div()
            .size_full()
            .flex()
            .flex_col()
            .child(self.header(&connection.name, cx))
            .child(
                div()
                    .flex_1()
                    .min_h_0()
                    .flex()
                    .when(reveal > 0., |body| {
                        let tree = if skeleton {
                            div()
                                .w(px(self.widths.tree))
                                .h_full()
                                .border_r_1()
                                .border_color(content(0.08))
                                .debug_selector(|| "knowledge-skeleton".into())
                                .child(loading::skeleton_rows("knowledge-skeleton"))
                                .into_any_element()
                        } else {
                            self.tree(cx)
                        };
                        // The clip narrows while the tree keeps its width, so it
                        // slides rather than squeezing.
                        body.child(
                            div()
                                .w(px(self.widths.tree * reveal))
                                .h_full()
                                .flex_shrink_0()
                                .when(reveal < 1., |clip| clip.overflow_hidden())
                                .child(tree),
                        )
                    })
                    .when_some(panel, |body, path| body.child(self.document(&path, cx)))
                    .child(self.scene(cx)),
            )
            .child(self.footer(&connection.root, cx))
            .into_any_element()
    }
}
