//! Vault images inside a note: fitted to the panel, framed, and opened in
//! the system viewer on click.
use super::{super::super::Knowledge, Walk};
use crate::theme::*;
use gpui::{AnyElement, Context, ObjectFit, Role, div, img, prelude::*, px};
use std::path::Path;

const MAX_HEIGHT: f32 = 520.;

fn missing(alt: &str) -> AnyElement {
    div()
        .px_3()
        .py_2()
        .rounded_lg()
        .border_1()
        .border_color(content(0.08))
        .flex()
        .items_center()
        .gap_2()
        .text_size(px(12.))
        .text_color(content(0.45))
        .child(icon("image-add", 14.).text_color(content(0.35)))
        .child(format!("Image unavailable: {alt}"))
        .into_any_element()
}

pub(super) fn image(
    path: Option<&Path>,
    alt: &str,
    width: Option<f32>,
    first: bool,
    walk: &mut Walk,
    cx: &mut Context<Knowledge>,
) -> AnyElement {
    let id = walk.id("image");
    let body = match path {
        None => missing(alt),
        Some(path) => {
            let file = path.to_path_buf();
            let label = alt.to_string();
            div()
                .id(id.clone())
                .debug_selector(move || id.to_string())
                .role(Role::Image)
                .aria_label(alt.to_string())
                .cursor_pointer()
                .max_w_full()
                .when_some(width, |frame, width| frame.w(px(width)))
                .rounded_lg()
                .overflow_hidden()
                .border_1()
                .border_color(content(0.08))
                .child(
                    img(path.to_path_buf())
                        .max_w_full()
                        .max_h(px(MAX_HEIGHT))
                        .when_some(width, |image, width| image.w(px(width)))
                        .object_fit(ObjectFit::Contain)
                        .with_fallback(move || missing(&label)),
                )
                .on_click(cx.listener(move |_, _, _, cx| cx.open_with_system(&file)))
                .into_any_element()
        }
    };
    div()
        .pt(px(if first { 0. } else { 14. }))
        .child(body)
        .into_any_element()
}
