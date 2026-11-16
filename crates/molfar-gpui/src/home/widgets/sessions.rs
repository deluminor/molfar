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
    pub(super) fn sessions_widget(&self, body: Body, cx: &mut Context<Self>) -> AnyElement {
        let sessions = match &self.feeds.sessions {
            Load::Loading => return card::note("Loading…").into_any_element(),
            Load::Failed(error) => return card::note(error.clone()).into_any_element(),
            Load::Ready(sessions) => summary::recent_sessions(sessions),
        };
        if sessions.is_empty() {
            return card::note("No sessions yet").into_any_element();
        }
        let now = molfar_core::time::now_ms();
        let wide = body.w >= 260.;

        let mut list = div().size_full().flex().flex_col().gap_0p5();
        for session in sessions.into_iter().take(parts::fit(body.h, 26.)) {
            let id = session.id;
            list =
                list.child(
                    parts::row(SharedString::from(format!("home-session-{id}")))
                        .debug_selector(move || format!("home-session-{id}"))
                        .child(provider_glyph(&session.provider, 12.))
                        .child(div().flex_1().min_w_0().truncate().child(
                            if session.title.is_empty() {
                                "Untitled".to_string()
                            } else {
                                session.title.clone()
                            },
                        ))
                        .when(wide, |row| {
                            row.child(
                                div()
                                    .max_w(px(110.))
                                    .truncate()
                                    .text_size(px(10.))
                                    .text_color(content(0.4))
                                    .child(summary::project_name(&session.cwd).to_owned()),
                            )
                        })
                        .child(
                            div()
                                .flex_shrink_0()
                                .font_family(mono())
                                .text_size(px(10.))
                                .text_color(content(0.4))
                                .child(molfar_core::time::relative(session.updated_at, now)),
                        )
                        .on_click(cx.listener(move |_, _, _, cx| cx.emit(Event::OpenSession(id)))),
                );
        }
        list.into_any_element()
    }
}
