use super::{
    super::{Event, Home, card},
    Body,
    parts::{self, mono},
};
use crate::theme::*;
use gpui::{AnyElement, Context, SharedString, div, prelude::*, px};

impl Home {
    pub(super) fn inbox_widget(&self, body: Body, cx: &mut Context<Self>) -> AnyElement {
        let Some(inbox) = &self.sources.inbox else {
            return card::note("Inbox unavailable").into_any_element();
        };
        let pulse = inbox.read(cx).pulse(parts::fit(body.h, 26.));
        if pulse.loading {
            return card::note("Loading…").into_any_element();
        }
        if pulse.rows.is_empty() {
            return card::note(pulse.error.unwrap_or_else(|| "Inbox clear".into()))
                .into_any_element();
        }

        let mut list = div().size_full().flex().flex_col().gap_0p5();
        for row in pulse.rows {
            let key = row.key.clone();
            let selector = format!("home-inbox-{}", row.key);
            list =
                list.child(
                    parts::row(SharedString::from(selector.clone()))
                        .debug_selector(move || selector.clone())
                        .child(parts::dot(row.unseen))
                        .child(div().flex_1().min_w_0().truncate().child(row.title))
                        .child(
                            div()
                                .flex_shrink_0()
                                .font_family(mono())
                                .text_size(px(10.))
                                .text_color(content(0.4))
                                .child(row.provider),
                        )
                        .on_click(cx.listener(move |_, _, _, cx| {
                            cx.emit(Event::OpenInbox(Some(key.clone())))
                        })),
                );
        }
        list.into_any_element()
    }

    pub(super) fn inbox_badge(&self, cx: &gpui::App) -> Option<AnyElement> {
        let unseen = self.sources.inbox.as_ref()?.read(cx).unread_count();
        (unseen > 0).then(|| {
            div()
                .font_family(mono())
                .text_size(px(10.))
                .text_color(accent_color())
                .child(format!("{unseen} NEW"))
                .into_any_element()
        })
    }
}
