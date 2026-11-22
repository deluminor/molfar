use gpui::{AnyElement, ClipboardItem, Context, Div, Focusable, FontWeight, div, prelude::*, px};
use molfar_core::jira::{self, Issue};

use super::{JiraReader, Panel};
use crate::{
    inbox::{
        jira::actions::Pending,
        ui::{action, caption, icon_action, menu_row},
    },
    popover::{Align, Anchor, popover},
    theme::*,
};

impl JiraReader {
    pub(super) fn toolbar(&self, issue: &Issue, cx: &mut Context<Self>) -> AnyElement {
        let browse = format!("{}/browse/{}", self.site.trim_end_matches('/'), issue.key);
        let link = jira::format_issue(&self.site, &issue.key).unwrap_or_default();
        div()
            .pt(px(2.))
            .flex()
            .flex_wrap()
            .items_center()
            .gap(px(8.))
            .when(!self.project.is_empty(), |bar| {
                bar.child(
                    action("jira-start-session", "Open in new session")
                        .px(px(12.))
                        .bg(content(1.))
                        .text_color(shell_fill())
                        .font_weight(FontWeight::MEDIUM)
                        .on_click(cx.listener(|this, _, _, cx| this.handoff(false, cx))),
                )
            })
            .child(
                icon_action("jira-add-to-chat", "Add to chat", "comment-add")
                    .on_click(cx.listener(|this, _, _, cx| this.insert_issue(false, cx))),
            )
            .child(
                icon_action("jira-copy-link", "Copy link", "link").on_click(move |_, _, cx| {
                    cx.write_to_clipboard(ClipboardItem::new_string(link.clone()))
                }),
            )
            .child(
                icon_action("jira-open", "Open in Jira", "external-link")
                    .on_click(move |_, _, cx| cx.open_url(&browse)),
            )
            .child(div().w(px(1.)).h(px(16.)).bg(content(0.1)))
            .child(self.panel_toggle(
                "jira-comment",
                "Comment",
                "message-square",
                Panel::Comment,
                cx,
            ))
            .child(self.panel_toggle(
                "jira-transition",
                "Status",
                "check-circle",
                Panel::Transition,
                cx,
            ))
            .child(self.panel_toggle("jira-edit", "Edit", "pencil-edit", Panel::Edit, cx))
            .child(
                icon_action("jira-more", "More", "more-horizontal")
                    .relative()
                    .child(self.more_anchor.probe())
                    .when(self.more_open, |d| d.bg(content(0.1)))
                    .on_click(cx.listener(|this, _, _, cx| {
                        this.more_open = !this.more_open;
                        cx.notify();
                    })),
            )
            .when(self.more_open, |bar| bar.child(self.more_menu(issue, cx)))
            .into_any_element()
    }

    fn panel_toggle(
        &self,
        id: &'static str,
        label: &'static str,
        glyph: &'static str,
        panel: Panel,
        cx: &mut Context<Self>,
    ) -> gpui::Stateful<Div> {
        icon_action(id, label, glyph)
            .when(self.panel == Some(panel), |d| {
                d.bg(content(0.1)).text_color(content(1.))
            })
            .on_click(cx.listener(move |this, _, window, cx| {
                this.panel = (this.panel != Some(panel)).then_some(panel);
                this.pending = None;
                match this.panel {
                    Some(Panel::Transition) => this.load_transitions(cx),
                    Some(Panel::Comment) => window.focus(&this.comment_input.focus_handle(cx), cx),
                    _ => {}
                }
                cx.notify();
            }))
    }

    fn more_menu(&self, issue: &Issue, cx: &mut Context<Self>) -> AnyElement {
        let weak = cx.entity().downgrade();
        let epic = issue.type_name.eq_ignore_ascii_case("epic");
        let key = issue.key.clone();
        let project = issue.key.split('-').next().unwrap_or_default().to_string();
        let site = self.site.clone();
        let mut rows = vec![
            caption("ADD TO CHAT").into_any_element(),
            menu_row("jira-add-comments", "Issue with comments", false)
                .on_click(cx.listener(|this, _, _, cx| this.insert_issue(true, cx)))
                .into_any_element(),
        ];
        if epic {
            rows.push(
                menu_row("jira-add-epic", "Epic with child issues", false)
                    .on_click(cx.listener(|this, _, _, cx| {
                        if let Some(issue) = this.issue.clone() {
                            this.insert_epic(&issue, cx);
                        }
                    }))
                    .into_any_element(),
            );
        }
        rows.push(caption("ISSUE").into_any_element());
        rows.push(
            menu_row("jira-assign-me", "Assign to me", false)
                .on_click(cx.listener(|this, _, _, cx| {
                    if let Some(key) = this.issue.as_ref().map(|issue| issue.key.clone()) {
                        this.pending = Some(Pending::Assign { key });
                        this.more_open = false;
                        cx.notify();
                    }
                }))
                .into_any_element(),
        );
        if !self.project.is_empty() {
            rows.push(
                menu_row("jira-create-card", "Create Board card", false)
                    .on_click(cx.listener(|this, _, _, cx| this.handoff(true, cx)))
                    .into_any_element(),
            );
        }
        rows.push(
            menu_row("jira-copy-key", "Copy key", false)
                .on_click(move |_, _, cx| {
                    cx.write_to_clipboard(ClipboardItem::new_string(key.clone()))
                })
                .into_any_element(),
        );
        rows.push(
            menu_row("jira-copy-project", "Copy project link", false)
                .on_click(cx.listener(move |this, _, _, cx| {
                    match jira::format_project(&site, &project) {
                        Ok(link) => cx.write_to_clipboard(ClipboardItem::new_string(link)),
                        Err(error) => this.error = Some(error.to_string()),
                    }
                    cx.notify();
                }))
                .into_any_element(),
        );
        popover("jira-more-menu", Anchor::Slot(self.more_anchor.clone()))
            .align(Align::Start)
            .width(220.)
            .padding(4.)
            .on_dismiss(move |_, cx| {
                let _ = weak.update(cx, |this, cx| {
                    this.more_open = false;
                    cx.notify();
                });
            })
            .child(div().flex().flex_col().children(rows))
            .into_any_element()
    }
}
