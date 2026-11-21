use super::{View, render::ReaderBlock};
use crate::{
    knowledge::document::note::{Walk, blocks, image, style, tint},
    markdown,
    theme::*,
};
use gpui::{AnyElement, Context, FontWeight, Role, div, prelude::*, px};
use molfar_core::confluence::page::Page;

impl View {
    pub(super) fn block_element(
        &self,
        block: &ReaderBlock,
        page: &Page,
        first: bool,
        walk: &mut Walk,
        cx: &mut Context<Self>,
    ) -> AnyElement {
        match block {
            ReaderBlock::Common(block) => blocks::block(block, first, walk, None, cx),
            ReaderBlock::Image(path, alt) => {
                image::image(path.as_deref(), alt, None, first, walk, cx)
            }
            ReaderBlock::Status(label, color) => {
                let hue = match color.to_ascii_lowercase().as_str() {
                    "green" => Some(0.4),
                    "yellow" => Some(0.12),
                    "red" => Some(0.0),
                    "blue" => Some(0.58),
                    "purple" => Some(0.8),
                    _ => None,
                };
                div()
                    .debug_selector(|| "confluence-status".into())
                    .mt_2()
                    .child(
                        div().flex().child(
                            div()
                                .px_2()
                                .py_0p5()
                                .rounded_md()
                                .bg(tint(hue, 0.14))
                                .text_color(tint(hue, 0.95))
                                .text_size(px(12.))
                                .font_weight(FontWeight::SEMIBOLD)
                                .child(label.clone()),
                        ),
                    )
                    .into_any_element()
            }
            ReaderBlock::Jira(runs) => div()
                .debug_selector(|| "confluence-jira".into())
                .mt_2()
                .child(markdown::inline(runs, walk.id("jira"), 13.))
                .into_any_element(),
            ReaderBlock::Placeholder(name) => {
                let url = page.url.clone();
                div()
                    .debug_selector(|| "confluence-placeholder".into())
                    .rounded_md()
                    .bg(content(0.04))
                    .px_3()
                    .py_2()
                    .mt_2()
                    .text_size(px(12.))
                    .child(format!("Unsupported Confluence macro: {name}."))
                    .child(
                        div()
                            .id(walk.id("macro-action"))
                            .role(Role::Button)
                            .cursor_pointer()
                            .text_color(accent_color())
                            .child("Open in Confluence")
                            .on_click(move |_, _, cx| cx.open_url(&url)),
                    )
                    .into_any_element()
            }
            ReaderBlock::Panel(kind, children) => {
                self.panel_element(kind, children, page, walk, cx)
            }
            ReaderBlock::Expand(title, children) => {
                let id = walk.next_callout();
                let expanded = self.folded.contains(&id);
                let body: Vec<_> = children
                    .iter()
                    .enumerate()
                    .map(|(index, child)| self.block_element(child, page, index == 0, walk, cx))
                    .collect();
                div()
                    .id(("confluence-expand-block", id))
                    .debug_selector(|| "confluence-expand".into())
                    .mt_3()
                    .rounded_lg()
                    .border_1()
                    .border_color(content(0.08))
                    .px_3()
                    .py_2()
                    .child(
                        div()
                            .id(("confluence-expand-toggle", id))
                            .role(Role::Button)
                            .aria_expanded(expanded)
                            .cursor_pointer()
                            .flex()
                            .items_center()
                            .gap_2()
                            .child(icon(
                                if expanded {
                                    "chevron-down"
                                } else {
                                    "chevron-right"
                                },
                                13.,
                            ))
                            .child(title.clone())
                            .on_click(cx.listener(move |this, _, _, cx| {
                                if !this.folded.remove(&id) {
                                    this.folded.insert(id);
                                }
                                cx.notify();
                            })),
                    )
                    .when(expanded, |expand| expand.child(div().pt_2().children(body)))
                    .into_any_element()
            }
        }
    }

    fn panel_element(
        &self,
        kind: &str,
        children: &[ReaderBlock],
        page: &Page,
        walk: &mut Walk,
        cx: &mut Context<Self>,
    ) -> AnyElement {
        let (hue, glyph) = style(kind);
        let label = if kind.is_empty() { "Quote" } else { kind };
        div()
            .debug_selector(|| "confluence-callout".into())
            .mt_3()
            .rounded_lg()
            .border_l_2()
            .border_color(tint(hue, 0.8))
            .bg(tint(hue, 0.06))
            .px_4()
            .py_2p5()
            .child(
                div()
                    .flex()
                    .items_center()
                    .gap_2()
                    .font_weight(FontWeight::SEMIBOLD)
                    .text_color(tint(hue, 1.))
                    .child(icon(glyph, 14.))
                    .child(label.to_owned()),
            )
            .children(
                children
                    .iter()
                    .enumerate()
                    .map(|(index, child)| self.block_element(child, page, index == 0, walk, cx)),
            )
            .into_any_element()
    }
}
