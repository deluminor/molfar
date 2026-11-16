use super::super::Board;
use crate::modal::{self, sheet};
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
        let mut list = sheet::list();
        let Some(panel) = &self.review else {
            return list.into_any_element();
        };
        let Some(review) = panel.data.as_ref().and_then(|data| data.final_review()) else {
            return list.into_any_element();
        };

        if review.review.findings.is_empty() {
            return modal::body("No findings. Add a note to request rework.").into_any_element();
        }

        let enabled = !panel.busy && !panel.loading && !panel.reload_required;
        for (index, finding) in review.review.findings.iter().enumerate() {
            let selected = panel.selected.contains(&finding.id);
            let label = format!(
                "{} [{}] {}",
                finding.id,
                finding.severity.id(),
                finding.title
            );
            let meta = match &finding.file {
                Some(file) => format!("{} · {}", finding.severity.id(), file),
                None => finding.severity.id().to_string(),
            };

            let text = div()
                .flex_1()
                .min_w_0()
                .child(sheet::row_title(format!(
                    "{} · {}",
                    finding.id, finding.title
                )))
                .child(sheet::row_meta(meta))
                .when(!finding.body.is_empty(), |d| {
                    d.child(modal::body(finding.body.clone()).mt(px(6.)))
                });
            let row = sheet::row(("board-rework-finding", index), selected)
                .debug_selector(move || format!("board-rework-finding-{index}"))
                .role(Role::CheckBox)
                .aria_label(label)
                .aria_toggled(if selected {
                    gpui::Toggled::True
                } else {
                    gpui::Toggled::False
                })
                .track_focus(&panel.finding_focus[index])
                .child(sheet::check(selected))
                .child(text);
            list = list.child(modal::disabled(row, !enabled).on_click(
                cx.listener(move |this, _, _, cx| this.toggle_rework_finding(index, cx)),
            ));
        }
        list.into_any_element()
    }
}

#[cfg(test)]
mod tests;
