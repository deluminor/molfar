//! The issue body as a virtualized list: details, one item per description
//! block, the sections, then one item per comment, so a long issue lays out
//! only what is on screen.
use gpui::{AnyElement, Context, ListOffset, Role, Window, div, list, prelude::*, px};
use molfar_core::jira::Issue;

use super::JiraReader;
use crate::{
    inbox::{jira::widgets::section_title, ui::message},
    theme::*,
};

enum Row {
    Details,
    Description(usize),
    Sections,
    Comment(usize),
    End,
}

impl JiraReader {
    fn row(&self, index: usize) -> Row {
        let description = self.description.len();
        let comments = description + 2;
        if index == 0 {
            return Row::Details;
        }
        if index <= description {
            return Row::Description(index - 1);
        }
        if index == description + 1 {
            return Row::Sections;
        }
        if index - comments < self.comments.len() {
            return Row::Comment(index - comments);
        }

        Row::End
    }

    /// Matches the list to a newly shown issue: another issue starts at the
    /// top, a refreshed one keeps its place.
    pub(super) fn sync_body(&mut self, switched: bool) {
        let kept = (!switched).then(|| self.body.logical_scroll_top());
        let count = self.description.len() + self.comments.len() + 3;
        self.body.reset(count);
        if let Some(top) = kept {
            self.body.scroll_to(ListOffset {
                item_ix: top.item_ix.min(count - 1),
                offset_in_item: top.offset_in_item,
            });
        }
    }

    /// Reordered comments invalidate heights measured off screen.
    fn resort_comments(&mut self) {
        self.newest = !self.newest;
        let start = self.description.len() + 2;
        let count = self.comments.len();
        self.body.splice(start..start + count, count);
    }

    pub(super) fn body(&self, cx: &mut Context<Self>) -> AnyElement {
        let entity = cx.entity();
        list(self.body.clone(), move |index, window, cx| {
            entity.update(cx, |this, cx| this.body_row(index, window, cx))
        })
        .size_full()
        .into_any_element()
    }

    fn body_row(&self, index: usize, window: &mut Window, cx: &mut Context<Self>) -> AnyElement {
        let Some(issue) = &self.issue else {
            return div().into_any_element();
        };
        let row = div().max_w(px(820.)).px(px(20.));

        match self.row(index) {
            Row::Details => row
                .pt(px(16.))
                .child(self.details(issue))
                .child(section_title("Description"))
                .when(self.description.is_empty(), |row| {
                    row.child(message("No description").p_0())
                }),
            Row::Description(block) => row
                .text_size(px(13.))
                .child(self.description.render(self, block, cx)),
            Row::Sections => row.child(self.sections(issue, cx)),
            Row::Comment(position) => row.child(self.comment(position, window, cx)),
            Row::End => row.h(px(40.)),
        }
        .into_any_element()
    }

    fn sections(&self, issue: &Issue, cx: &mut Context<Self>) -> AnyElement {
        let subtasks = self.linked("subtask", &issue.subtasks, cx);
        let links = self.linked("link", &issue.links, cx);
        let files = self.attachments(issue, cx);

        div()
            .when(!subtasks.is_empty(), |d| {
                d.child(section_title(format!("Sub-tasks · {}", subtasks.len())))
                    .children(subtasks)
            })
            .when(!links.is_empty(), |d| {
                d.child(section_title("Linked issues")).children(links)
            })
            .when(!files.is_empty(), |d| {
                d.child(section_title("Attachments")).children(files)
            })
            .child(
                section_title(format!("Comments · {}", self.comments.len()))
                    .child(div().flex_1())
                    .child(
                        div()
                            .id("jira-comment-order")
                            .role(Role::Button)
                            .cursor_pointer()
                            .text_color(content(0.5))
                            .hover(|s| s.text_color(content(1.)))
                            .child(if self.newest {
                                "Newest first"
                            } else {
                                "Oldest first"
                            })
                            .on_click(cx.listener(|this, _, _, cx| {
                                this.resort_comments();
                                cx.notify();
                            })),
                    ),
            )
            .when(self.comments.is_empty(), |d| {
                d.child(message("No comments yet").p_0())
            })
            .into_any_element()
    }
}
