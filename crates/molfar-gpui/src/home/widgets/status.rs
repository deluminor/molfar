use super::{
    super::{
        Event, Home, card,
        data::{feeds::Load, summary},
    },
    Body,
    parts::{self, mono},
};
use crate::theme::*;
use gpui::{AnyElement, Context, Div, SharedString, div, prelude::*, px};

impl Home {
    pub(super) fn status_widget(&self, body: Body, cx: &mut Context<Self>) -> AnyElement {
        let (sessions, automations) = match (&self.feeds.sessions, &self.feeds.automations) {
            (Load::Loading, _) => return card::note("Loading…").into_any_element(),
            (Load::Failed(error), _) => return card::note(error.clone()).into_any_element(),
            (Load::Ready(sessions), Load::Ready(automations)) => {
                (sessions.as_slice(), automations.as_slice())
            }
            (Load::Ready(sessions), _) => (sessions.as_slice(), &[][..]),
        };
        let now = molfar_core::time::now_ms();
        let status = summary::status(sessions, automations, now);
        let live = status.recent_sessions > 0 || status.enabled_automations > 0;
        let size = (body.h / 7.).clamp(13., 22.);

        let metrics = [
            (
                "Sessions 24h",
                status.recent_sessions.to_string(),
                status.recent_sessions > 0,
                false,
            ),
            (
                "Automations",
                status.enabled_automations.to_string(),
                status.enabled_automations > 0,
                true,
            ),
            (
                "Next due",
                summary::next_due(status.next_due_at, now as i64),
                false,
                true,
            ),
        ];
        let mut list = div().flex().flex_col().gap_2();
        for (caption, value, active, opens) in metrics {
            list = list.child(metric_row(caption, value, active, size, opens, cx));
        }

        div()
            .size_full()
            .flex()
            .flex_col()
            .justify_between()
            .gap_3()
            .child(
                div()
                    .flex()
                    .items_center()
                    .gap_2()
                    .child(
                        div()
                            .size(px(6.))
                            .rounded_full()
                            .bg(if live { accent_color() } else { content(0.25) })
                            .when(live, |dot| {
                                dot.shadow(vec![gpui::BoxShadow {
                                    color: accent_color().opacity(0.8),
                                    offset: gpui::point(px(0.), px(0.)),
                                    blur_radius: px(6.),
                                    spread_radius: px(0.),
                                    inset: false,
                                }])
                            }),
                    )
                    .child(
                        div()
                            .font_family(mono())
                            .text_size(px(10.))
                            .text_color(if live { accent_color() } else { content(0.45) })
                            .child(if live { "ONLINE" } else { "IDLE" }),
                    ),
            )
            .child(list)
            .into_any_element()
    }
}

fn metric_row(
    caption: &'static str,
    value: String,
    active: bool,
    size: f32,
    opens: bool,
    cx: &mut Context<Home>,
) -> Div {
    let row = div()
        .id(SharedString::from(format!("home-status-{caption}")))
        .flex()
        .items_baseline()
        .justify_between()
        .gap_2()
        .rounded_sm()
        .child(parts::label(caption))
        .child(
            div()
                .font_family(mono())
                .text_size(px(size))
                .text_color(if active { accent_color() } else { content(0.9) })
                .child(value),
        );
    let row = if opens {
        row.cursor_pointer()
            .hover(|style| style.bg(accent_color().opacity(0.06)))
            .on_click(cx.listener(|_, _, _, cx| cx.emit(Event::OpenAutomation(String::new()))))
    } else {
        row
    };
    div().child(row)
}
