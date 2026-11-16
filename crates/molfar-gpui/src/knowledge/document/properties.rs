//! Frontmatter as a Properties card: lists as chips, tags with a hash.
use crate::theme::*;
use gpui::{AnyElement, FontWeight, div, prelude::*, px};
use molfar_core::knowledge::NoteProperty;

fn glyph(key: &str, list: bool) -> &'static str {
    match key {
        "tags" | "tag" => "filter",
        "aliases" | "alias" => "note",
        "date" | "created" | "updated" | "modified" => "clock",
        _ if list => "list-bullet",
        _ => "sliders",
    }
}

fn chip(text: String) -> gpui::Div {
    div()
        .px_1p5()
        .py(px(1.))
        .rounded_md()
        .bg(accent_color().opacity(0.12))
        .text_color(accent_color())
        .text_size(px(11.))
        .child(text)
}

fn value(property: &NoteProperty) -> AnyElement {
    if property.values.is_empty() {
        return div()
            .text_color(content(0.3))
            .child("Empty")
            .into_any_element();
    }
    if !property.list {
        return div()
            .min_w_0()
            .text_color(content(0.85))
            .child(property.values.join(", "))
            .into_any_element();
    }
    let tags = matches!(property.key.as_str(), "tags" | "tag");
    div()
        .flex()
        .flex_wrap()
        .gap_1()
        .children(property.values.iter().map(|item| {
            chip(if tags {
                format!("#{item}")
            } else {
                item.clone()
            })
        }))
        .into_any_element()
}

pub(crate) fn card(properties: &[NoteProperty]) -> Option<AnyElement> {
    if properties.is_empty() {
        return None;
    }
    Some(
        div()
            .id("knowledge-properties")
            .debug_selector(|| "knowledge-properties".into())
            .mb_3()
            .p_3()
            .rounded_lg()
            .border_1()
            .border_color(content(0.08))
            .bg(content(0.025))
            .flex()
            .flex_col()
            .gap_1p5()
            .text_size(px(12.))
            .child(
                div()
                    .text_size(px(10.))
                    .font_weight(FontWeight::SEMIBOLD)
                    .text_color(content(0.4))
                    .child("PROPERTIES"),
            )
            .children(properties.iter().map(|property| {
                div()
                    .flex()
                    .items_start()
                    .gap_3()
                    .child(
                        div()
                            .w(px(120.))
                            .flex_shrink_0()
                            .flex()
                            .items_center()
                            .gap_1p5()
                            .text_color(content(0.5))
                            .child(
                                icon(glyph(&property.key, property.list), 12.)
                                    .text_color(content(0.35)),
                            )
                            .child(div().truncate().child(property.key.clone())),
                    )
                    .child(div().flex_1().min_w_0().child(value(property)))
            }))
            .into_any_element(),
    )
}
