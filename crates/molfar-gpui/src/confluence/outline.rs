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
                .h(px(26.))
                .px_2()
                .flex()
                .items_center()
                .text_size(px(12.))
                .text_color(content(0.62))
                .hover(|row| row.bg(content(0.06)).text_color(content(1.)))
                .child(div().min_w_0().truncate().child(title.clone()))
                .tooltip(crate::tooltip::text(title.clone()))
                .on_click(cx.listener(move |this, _, _, cx| {
                    this.document_list.scroll_to(gpui::ListOffset {
                        item_ix: index + 1,
                        offset_in_item: px(0.),
                    });
                    cx.notify();
                }))
        });
        div()
            .id("confluence-outline")
            .w(px(200.))
            .flex_shrink_0()
            .overflow_y_scroll()
            .border_l_1()
            .border_color(content(0.07))
            .px_2()
            .py_4()
            .child(
                div()
                    .px_2()
                    .mb_2()
                    .text_size(px(11.))
                    .font_weight(FontWeight::SEMIBOLD)
                    .text_color(content(0.45))
                    .child("ON THIS PAGE"),
            )
            .children(headings)
            .into_any_element()
    }
}
