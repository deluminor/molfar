use super::{
    super::{
        Event, Home, card,
        data::{feeds::Load, summary},
    },
    Body,
    parts::{self, mono},
};
use crate::theme::*;
use gpui::{AnyElement, Context, SharedString, div, prelude::*, px};

impl Home {
    pub(super) fn automations_widget(&self, body: Body, cx: &mut Context<Self>) -> AnyElement {
        let automations = match &self.feeds.automations {
            Load::Loading => return card::note("Loading…").into_any_element(),
            Load::Failed(error) => return card::note(error.clone()).into_any_element(),
            Load::Ready(automations) => summary::recent_automations(automations),
        };
        if automations.is_empty() {
            return card::note("No automations yet").into_any_element();
        }
        let now = molfar_core::time::now_ms() as i64;

        let mut list = div().size_full().flex().flex_col().gap_0p5();
        for automation in automations.into_iter().take(parts::fit(body.h, 26.)) {
            let failed = automation
                .last_run_status
                .as_deref()
                .is_some_and(|status| status.eq_ignore_ascii_case("failed"));
            let when = if automation.enabled {
                summary::next_due(Some(automation.next_run_at), now)
            } else {
                "paused".into()
            };
            let id = automation.id.clone();
            let selector = format!("home-automation-{id}");
            list = list.child(
                parts::row(SharedString::from(selector.clone()))
                    .debug_selector(move || selector.clone())
                    .child(if failed {
                        div()
                            .size(px(6.))
                            .flex_shrink_0()
                            .rounded_full()
                            .bg(crate::modal::danger(0.9))
                    } else {
                        parts::dot(automation.enabled)
                    })
                    .child(div().flex_1().min_w_0().truncate().child(
                        if automation.name.trim().is_empty() {
                            "Untitled".to_string()
                        } else {
                            automation.name.trim().to_string()
                        },
                    ))
                    .child(
                        div()
                            .flex_shrink_0()
                            .font_family(mono())
                            .text_size(px(10.))
                            .text_color(content(0.4))
                            .child(when),
                    )
                    .on_click(
                        cx.listener(move |_, _, _, cx| cx.emit(Event::OpenAutomation(id.clone()))),
                    ),
            );
        }
        list.into_any_element()
    }
}
