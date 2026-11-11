//! A note's outgoing links and backlinks as chips.
use super::super::Knowledge;
use crate::theme::*;
use gpui::{AnyElement, Context, FontWeight, Role, div, prelude::*, px};
use molfar_core::knowledge::{
    LinkResolution, VaultLink, VaultNote, backlinks, note_index, resolve_vault_link,
};

const CHIP_LIMIT: usize = 40;

fn section(label: &'static str, count: usize) -> gpui::Div {
    div()
        .flex()
        .items_center()
        .gap_1p5()
        .text_size(px(10.))
        .font_weight(FontWeight::SEMIBOLD)
        .text_color(content(0.4))
        .child(label)
        .child(div().text_color(content(0.3)).child(count.to_string()))
}

fn chip(
    id: (&'static str, usize),
    selector: String,
    label: String,
    resolved: bool,
) -> gpui::Stateful<gpui::Div> {
    div()
        .id(id)
        .debug_selector(move || selector.clone())
        .role(Role::Link)
        .aria_label(label.clone())
        .when(resolved, |chip| {
            chip.cursor_pointer()
                .hover(|style| style.bg(accent_color().opacity(0.18)))
        })
        .max_w(px(200.))
        .truncate()
        .h(px(22.))
        .px_2()
        .flex()
        .items_center()
        .rounded_md()
        .text_size(px(11.))
        .bg(if resolved {
            accent_color().opacity(0.1)
        } else {
            content(0.05)
        })
        .text_color(if resolved {
            accent_color()
        } else {
            content(0.35)
        })
        .child(label)
}

/// The open note's links, resolved once per note or scan.
#[derive(Clone, Debug, Default)]
pub(crate) struct Relations {
    links: Vec<(VaultLink, bool)>,
    backlinks: Vec<(String, String)>,
}

impl Relations {
    pub(crate) fn of(notes: &[VaultNote], path: &str) -> Self {
        let index = note_index(notes);
        let links = notes
            .iter()
            .find(|note| note.path == path)
            .map(|note| {
                note.links
                    .iter()
                    .map(|link| {
                        let resolved = matches!(
                            resolve_vault_link(&index, path, link),
                            LinkResolution::Resolved { .. }
                        );
                        (link.clone(), resolved)
                    })
                    .collect()
            })
            .unwrap_or_default();
        Self {
            links,
            backlinks: backlinks(notes, path),
        }
    }
}

impl Knowledge {
    pub(super) fn relations(&self, cx: &mut Context<Self>) -> AnyElement {
        let links = &self.relations.links;
        let incoming = self.relations.backlinks.clone();

        let open = self.relations_open;
        let summary = div()
            .id("knowledge-relations-toggle")
            .debug_selector(|| "knowledge-relations-toggle".into())
            .role(Role::Button)
            .aria_expanded(open)
            .aria_label("Links and backlinks")
            .cursor_pointer()
            .h(px(34.))
            .px_4()
            .flex()
            .items_center()
            .gap_3()
            .text_size(px(11.))
            .text_color(content(0.5))
            .hover(|style| style.bg(content(0.03)).text_color(content(0.8)))
            .child(icon("share", 12.).text_color(content(0.4)))
            .child(format!("{} links", links.len()))
            .child(div().text_color(content(0.25)).child("·"))
            .child(format!("{} backlinks", incoming.len()))
            .child(div().flex_1())
            .child(
                icon(if open { "chevron-down" } else { "chevron-up" }, 13.)
                    .text_color(content(0.4)),
            )
            .on_click(cx.listener(|this, _, _, cx| {
                this.relations_open = !this.relations_open;
                cx.notify();
            }));
        if !open {
            return div()
                .flex_shrink_0()
                .border_t_1()
                .border_color(content(0.08))
                .child(summary)
                .into_any_element();
        }

        div()
            .flex_shrink_0()
            .border_t_1()
            .border_color(content(0.08))
            .child(summary)
            .child(self.relation_chips(links, incoming, cx))
            .into_any_element()
    }

    fn relation_chips(
        &self,
        links: &[(VaultLink, bool)],
        incoming: Vec<(String, String)>,
        cx: &mut Context<Self>,
    ) -> AnyElement {
        div()
            .id("knowledge-relations")
            .debug_selector(|| "knowledge-relations".into())
            .max_h(px(220.))
            .overflow_y_scroll()
            .px_4()
            .pb_3()
            .flex()
            .flex_col()
            .gap_2()
            .child(section("LINKS", links.len()))
            .child(
                div().flex().flex_wrap().gap_1().children(
                    links.iter().take(CHIP_LIMIT).enumerate().map(
                        |(position, (link, resolved))| {
                            let resolved = *resolved;
                            let link = link.clone();
                            chip(
                                ("knowledge-link", position),
                                format!("knowledge-link-{position}"),
                                link.target.clone(),
                                resolved,
                            )
                            .on_click(
                                cx.listener(move |this, _, _, cx| this.open_resolved(&link, cx)),
                            )
                        },
                    ),
                ),
            )
            .child(section("BACKLINKS", incoming.len()))
            .child(div().flex().flex_wrap().gap_1().children(
                incoming.into_iter().take(CHIP_LIMIT).enumerate().map(
                    |(position, (source, title))| {
                        chip(
                            ("knowledge-backlink", position),
                            format!("knowledge-backlink-{position}"),
                            title,
                            true,
                        )
                        .on_click(
                            cx.listener(move |this, _, _, cx| this.open_note(source.clone(), cx)),
                        )
                    },
                ),
            ))
            .into_any_element()
    }

    pub(in crate::knowledge) fn open_resolved(&mut self, link: &VaultLink, cx: &mut Context<Self>) {
        let Some(path) = self.selected.clone() else {
            return;
        };
        if let LinkResolution::Resolved { path } =
            resolve_vault_link(&note_index(&self.notes), &path, link)
        {
            self.open_note(path, cx);
        }
    }
}
