use super::{
    super::{Home, card, data::usage},
    Body,
    parts::{self, mono},
};
use crate::{task_board::controls, theme::*};
use gpui::{AnyElement, Context, SharedString, div, prelude::*, px};

impl Home {
    pub(super) fn usage_widget(&self, body: Body, cx: &mut Context<Self>) -> AnyElement {
        let now = molfar_core::usage::now_ms();
        let rows = usage::rows(&self.sources.project, now, cx);
        if rows.is_empty() {
            return card::note("No provider usage yet").into_any_element();
        }
        let columns = if rows.len() > 1 && body.w >= 260. {
            2
        } else {
            1
        };
        let animate = !cx.reduce_motion();
        let entrance = self.entrance;

        let mut grid = div().size_full().flex().flex_wrap().content_start().gap_1();
        for row in rows {
            let key = row.kind.id();
            let detail = row
                .windows
                .iter()
                .map(|window| {
                    format!(
                        "{} {:.0}% · {}",
                        window.label(),
                        window.used_percent,
                        window.reset_label(now)
                    )
                })
                .collect::<Vec<_>>()
                .join("\n");
            let percent = row.used_percent;
            let tile = div()
                .id(SharedString::from(format!("home-usage-{key}")))
                .debug_selector(move || format!("home-usage-{key}"))
                .when(columns == 2, |tile| tile.w(gpui::relative(0.49)))
                .when(columns == 1, |tile| tile.w_full())
                .min_w_0()
                .flex()
                .flex_col()
                .gap_1p5()
                .px_2p5()
                .py_2()
                .rounded_md()
                .border_1()
                .border_color(gpui::transparent_black())
                .hover(|style| {
                    style
                        .border_color(accent_color().opacity(0.25))
                        .bg(accent_color().opacity(0.06))
                })
                .when(!detail.is_empty(), |tile| {
                    tile.tooltip(move |_, cx| controls::hint(detail.clone(), cx))
                })
                .child(
                    div()
                        .flex()
                        .items_baseline()
                        .justify_between()
                        .gap_2()
                        .child(
                            div()
                                .font_family(mono())
                                .text_size(px(10.))
                                .truncate()
                                .text_color(content(if row.fetching { 0.3 } else { 0.45 }))
                                .child(row.kind.label().to_uppercase()),
                        )
                        .children(percent.map(|percent| {
                            div()
                                .font_family(mono())
                                .text_size(px(15.))
                                .text_color(content(1.))
                                .child(format!("{percent:.0}%"))
                        })),
                )
                .child(match percent {
                    Some(percent) => parts::bar(
                        (
                            "home-usage-bar",
                            (entrance as usize) << 4 | row.kind as usize,
                        ),
                        percent as f32 / 100.,
                        accent_color().opacity(0.7),
                        animate,
                    ),
                    None => div()
                        .font_family(mono())
                        .text_size(px(11.))
                        .truncate()
                        .text_color(content(0.5))
                        .child(row.status.clone())
                        .into_any_element(),
                })
                .children(
                    row.reset
                        .map(|reset| format!("resets {reset}"))
                        .or_else(|| percent.map(|_| row.status.clone()))
                        .map(|meta| {
                            div()
                                .font_family(mono())
                                .text_size(px(10.))
                                .truncate()
                                .text_color(content(0.35))
                                .child(meta)
                        }),
                );
            grid = grid.child(tile);
        }
        grid.into_any_element()
    }
}
