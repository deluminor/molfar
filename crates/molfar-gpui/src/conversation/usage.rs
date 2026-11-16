use super::Conversation;
use crate::{
    consumption::{format, tooltip},
    popover::{Align, Anchor, Side, popover},
    runtime::locked,
    theme::*,
};
use gpui::{AnyElement, Context, Role, SharedString, div, prelude::*, px};

impl Conversation {
    /// Reloads the session's usage in the background after history loads or a turn ends.
    pub(super) fn refresh_usage(&mut self, cx: &mut Context<Self>) {
        if self.is_remote() {
            return;
        }
        let generation = self.usage.begin();
        let store = self.store.clone();
        let session = self.summary.id;
        let work = cx
            .background_executor()
            .spawn(async move { locked(&store)?.session_usage(session) });

        cx.spawn(async move |this, cx| {
            let result = work.await;
            let _ = this.update(cx, |this, cx| {
                if !this.usage.finish(generation, result) {
                    return;
                }
                let line = this.usage.visible().map(|summary| {
                    SharedString::from(format!("Session · {}", format::headline(&summary)))
                });
                this.transcript
                    .update(cx, |view, cx| view.set_session_usage(line, cx));
                cx.notify();
            });
        })
        .detach();
    }

    /// The composer's quiet session total; its hover card explains the estimate.
    pub(super) fn usage_chip(&self, cx: &mut Context<Self>) -> Option<AnyElement> {
        let summary = self.usage.visible();
        let error = self.usage.error().map(str::to_owned);
        if summary.is_none() && error.is_none() {
            return None;
        }
        let label = summary.map(|summary| {
            format::estimate(&summary).unwrap_or_else(|| format::tokens(summary.total_tokens()))
        });
        let aria = summary.map_or_else(
            || "Session usage unavailable".to_owned(),
            |summary| format!("Session usage, {}", format::headline(&summary)),
        );

        let chip = div()
            .id("session-usage")
            .debug_selector(|| "session-usage".into())
            .role(Role::Status)
            .aria_label(aria)
            .relative()
            .flex()
            .items_center()
            .gap(px(4.))
            .h(px(20.))
            .px(px(6.))
            .rounded(px(6.))
            .text_size(px(11.))
            .text_color(content(0.45))
            .hover(|style| style.bg(content(0.06)).text_color(content(0.7)))
            .child(self.usage.anchor.probe())
            .when_some(label, |d, label| d.child(label))
            .when(summary.is_none(), |d| d.child(icon("circle-alert", 12.)))
            .on_hover(cx.listener(|this, hovered: &bool, _, cx| {
                this.usage.hovered = *hovered;
                cx.notify();
            }));
        if !self.usage.hovered {
            return Some(chip.into_any_element());
        }

        let card = match (summary, error) {
            (Some(summary), _) => tooltip::summary_card("Session usage", &summary),
            (None, Some(error)) => div()
                .flex()
                .flex_col()
                .text_size(px(12.))
                .child("Usage unavailable")
                .child(
                    div()
                        .text_size(px(11.))
                        .text_color(content(0.5))
                        .child(error),
                ),
            (None, None) => return Some(chip.into_any_element()),
        };
        Some(
            chip.child(
                popover(
                    "session-usage-tooltip",
                    Anchor::Slot(self.usage.anchor.clone()),
                )
                .side(Side::Top)
                .align(Align::End)
                .max_width(280.)
                .padding(10.)
                .child(card),
            )
            .into_any_element(),
        )
    }
}
