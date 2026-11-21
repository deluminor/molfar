use gpui::{AnyElement, Context, FontWeight, Role, div, prelude::*, px};

use super::{View, render::DocumentView};
use crate::theme::*;

impl View {
    pub(super) fn outline(&self, doc: &DocumentView, cx: &mut Context<Self>) -> AnyElement {
        let headings = doc.headings.iter().enumerate().map(|(n, (index, title))| {
            let index = *index;
            div()
                .id(("confluence-outline", n))
                .debug_selector(|| "confluence-outline-entry".into())
                .role(Role::Button)
                .cursor_pointer()
                .rounded_md()
                .p_1()
                .text_size(px(12.))
                .text_color(content(0.62))
                .hover(|row| row.bg(content(0.06)))
                .child(title.clone())
                .on_click(cx.listener(move |this, _, _, cx| {
                    this.document_scroll.scroll_to_item(index + 2);
                    cx.notify();
                }))
        });
        div()
            .id("confluence-outline")
            .w(px(168.))
            .flex_shrink_0()
            .overflow_y_scroll()
            .border_l_1()
            .border_color(content(0.08))
            .p_3()
            .child(
                div()
                    .text_size(px(12.))
                    .font_weight(FontWeight::SEMIBOLD)
                    .mb_2()
                    .child("On this page"),
            )
            .children(headings)
            .into_any_element()
    }
}
