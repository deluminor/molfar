use super::super::Board;
use crate::{modal, theme::*};
use gpui::{AnyElement, Context, Role, div, prelude::*, px};

impl Board {
    pub(super) fn toggle_rework_finding(&mut self, index: usize, cx: &mut Context<Self>) {
        let Some(panel) = &mut self.review else {
            return;
        };
        if panel.busy || panel.loading || panel.reload_required {
            return;
        }
        let Some(review) = panel.data.as_ref().and_then(|data| data.final_review()) else {
            return;
        };
        let Some(finding) = review.review.findings.get(index) else {
            return;
        };
        if !panel.selected.remove(&finding.id) {
            panel.selected.insert(finding.id.clone());
        }
        cx.notify();
    }

    pub(super) fn rework_findings(&self, cx: &mut Context<Self>) -> AnyElement {
        let mut list = div().flex().flex_col().gap_2();
        let Some(panel) = &self.review else {
            return list.into_any_element();
        };
        let Some(review) = panel.data.as_ref().and_then(|data| data.final_review()) else {
            return list.into_any_element();
        };
        if review.review.findings.is_empty() {
            list = list.child(modal::body("No findings. Add a note to request rework."));
        }
        for (index, finding) in review.review.findings.iter().enumerate() {
            let selected = panel.selected.contains(&finding.id);
            let label = format!(
                "{} [{}] {}",
                finding.id,
                finding.severity.id(),
                finding.title
            );
            let mut row = div()
                .id(("board-rework-finding", index))
                .debug_selector(move || format!("board-rework-finding-{index}"))
                .role(Role::CheckBox)
                .aria_label(label.clone())
                .aria_selected(selected)
                .track_focus(&panel.finding_focus[index])
                .border_1()
                .border_color(content(0.12))
                .rounded(px(8.))
                .p_3()
                .focus_visible(|style| style.border_color(accent_color()))
                .flex()
                .flex_col()
                .gap_2()
                .child(
                    div()
                        .flex()
                        .items_center()
                        .gap_2()
                        .child(
                            div()
                                .w(px(14.))
                                .when(selected, |d| d.child(icon("check", 14.))),
                        )
                        .child(label),
                );
            if let Some(file) = &finding.file {
                row = row.child(modal::body(file.clone()));
            }
            if !finding.body.is_empty() {
                row = row.child(modal::body(finding.body.clone()));
            }
            let enabled = !panel.busy && !panel.loading && !panel.reload_required;
            row = modal::disabled(row, !enabled)
                .on_click(cx.listener(move |this, _, _, cx| this.toggle_rework_finding(index, cx)));
            list = list.child(row);
        }
        list.into_any_element()
    }
}

#[cfg(test)]
mod tests;
