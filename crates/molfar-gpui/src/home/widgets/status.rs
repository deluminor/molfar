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

pub(crate) fn columns(width: f32, height: f32) -> usize {
    if width >= 280. && height >= 160. {
        2
    } else {
        1
    }
}

impl Home {
    pub(super) fn status_widget(&self, body: Body, cx: &mut Context<Self>) -> AnyElement {
        let sessions = match &self.feeds.sessions {
            Load::Loading => return card::note("Loading sessions…").into_any_element(),
            Load::Failed(error) => return card::note(error.clone()).into_any_element(),
            Load::Ready(sessions) => sessions.as_slice(),
        };
        let (automations, automation_state) = match &self.feeds.automations {
            Load::Ready(items) => (Some(items.as_slice()), None),
            Load::Loading => (
                None,
                Some(if self.sources.automations.is_some() {
                    "Automations pending"
                } else {
                    "Automations unavailable"
                }),
            ),
            Load::Failed(_) => (None, Some("Automations unavailable")),
        };
        let now = molfar_core::time::now_ms();
        let status = summary::status(sessions, automations.unwrap_or_default(), now);
        let active = status.recent_sessions > 0;
        let columns = columns(body.w, body.h);
        let expanded = body.h >= 170.;
        let size = (body.h / 8.).clamp(14., 26.);
        let mut metrics = vec![
            ("Updated / 24h", status.recent_sessions.to_string(), false),
            (
                "Automations",
                automations.map_or("—".into(), |items| {
                    format!("{} / {}", status.enabled_automations, items.len())
                }),
                true,
            ),
            (
                "Next run",
                automations.map_or("—".into(), |_| {
                    summary::next_due(status.next_due_at, now as i64)
                }),
                true,
            ),
        ];
        if expanded || columns == 2 {
            let unread = self
                .sources
                .inbox
                .as_ref()
                .map(|inbox| inbox.read(cx).unread_count());
            metrics.push((
                "Unread inbox",
                unread.map_or("—".into(), |count| count.to_string()),
                false,
            ));
        }
        let mut tiles = div().flex().flex_col().gap_1();
        for row in metrics.chunks(columns) {
            let mut line = div().flex().gap_2();
            for (caption, value, opens) in row {
                line = line.child(tile(caption, value.clone(), size, columns == 1, *opens, cx));
            }
            tiles = tiles.child(line);
        }
        let source_label = automation_state.map(str::to_string).unwrap_or_else(|| {
            self.feeds
                .records_updated_at
                .map_or("Snapshot pending".into(), |at| {
                    let age = now.saturating_sub(at) / 1000;
                    if age > 60 {
                        format!("Snapshot · {}m ago", age / 60)
                    } else {
                        format!("Snapshot · {age}s ago")
                    }
                })
        });
        div()
            .size_full()
            .min_w_0()
            .overflow_hidden()
            .flex()
            .flex_col()
            .justify_between()
            .gap_2()
            .child(
                div()
                    .flex()
                    .items_center()
                    .gap_2()
                    .child(div().size(px(5.)).bg(if active {
                        accent_color()
                    } else {
                        content(0.35)
                    }))
                    .child(parts::label(automation_state.unwrap_or(if active {
                        "Recent activity"
                    } else {
                        "Quiet"
                    }))),
            )
            .child(tiles)
            .when(body.h >= 120., |view| {
                view.child(parts::label(source_label))
            })
            .into_any_element()
    }
}

fn tile(
    caption: &'static str,
    value: String,
    size: f32,
    compact: bool,
    opens: bool,
    cx: &mut Context<Home>,
) -> Div {
    let row = div()
        .id(SharedString::from(format!("home-status-{caption}")))
        .flex_1()
        .min_w_0()
        .flex()
        .gap_1()
        .when(compact, |row| {
            row.flex_row().items_baseline().justify_between()
        })
        .when(!compact, |row| {
            row.flex_col().p_2().rounded_md().bg(content(0.035))
        })
        .child(parts::label(caption))
        .child(
            div()
                .font_family(mono())
                .text_size(px(size))
                .line_height(px(size * 1.15))
                .text_color(content(0.95))
                .truncate()
                .child(value),
        );
    let row = if opens {
        row.cursor_pointer()
            .hover(|style| style.bg(accent_color().opacity(0.08)))
            .on_click(cx.listener(|_, _, _, cx| cx.emit(Event::OpenAutomation(String::new()))))
    } else {
        row
    };
    div().flex_1().min_w_0().child(row)
}

#[cfg(test)]
mod tests {
    use super::columns;

    #[test]
    fn status_tiles_use_rows_on_small_cards() {
        assert_eq!(columns(140., 180.), 1);
        assert_eq!(columns(279., 180.), 1);
        assert_eq!(columns(280., 180.), 2);
        assert_eq!(columns(900., 180.), 2);
        assert_eq!(columns(900., 92.), 1);
    }
}
