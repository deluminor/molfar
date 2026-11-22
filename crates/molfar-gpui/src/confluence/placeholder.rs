use gpui::{AnyElement, FontWeight, div, prelude::*, px};
use molfar_core::confluence::connector::Kind;

use super::{View, page::open_browser};
use crate::theme::*;

impl View {
    pub(super) fn placeholder(&self) -> AnyElement {
        let Some(node) = &self.selected_node else {
            return div()
                .flex_1()
                .flex()
                .flex_col()
                .items_center()
                .justify_center()
                .gap(px(12.))
                .child(icon("book-open", 24.).text_color(content(0.3)))
                .child(
                    div()
                        .text_size(px(13.))
                        .text_color(content(0.5))
                        .child("Choose a page to read"),
                )
                .into_any_element();
        };
        let message = if node.kind == Kind::Folder {
            "Expand the folder in the tree to browse its pages.".to_owned()
        } else {
            format!("Open this {} in Confluence to view it.", node.kind.label())
        };
        div()
            .flex_1()
            .flex()
            .flex_col()
            .items_center()
            .justify_center()
            .gap(px(10.))
            .child(
                icon(
                    if node.kind == Kind::Folder {
                        "folder"
                    } else {
                        "file"
                    },
                    24.,
                )
                .text_color(content(0.3)),
            )
            .child(
                div()
                    .text_size(px(15.))
                    .text_color(content(1.))
                    .font_weight(FontWeight::SEMIBOLD)
                    .child(node.title.clone()),
            )
            .child(
                div()
                    .text_size(px(12.))
                    .text_color(content(0.5))
                    .child(message),
            )
            .child(open_browser(node.url.clone()))
            .into_any_element()
    }
}
