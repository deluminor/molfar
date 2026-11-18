use super::super::Board;
use crate::{runtime::locked, theme::*};
use gpui::{AnyElement, Context, SharedString, div, prelude::*, px};
use molfar_core::task_board::{
    constants::FINAL_REVIEW, stage::contracts::constants::IMPL_REPORT, types::Card,
};

/// Owner-only checks from the latest implementation report of the card at Final review.
#[derive(Default)]
pub(in crate::task_board) struct State {
    shown: Option<(String, i64, Vec<String>)>,
    generation: u64,
}

impl State {
    fn for_card(&self, card: &str) -> &[String] {
        match &self.shown {
            Some((id, _, checks)) if id == card => checks,
            _ => &[],
        }
    }

    #[cfg(test)]
    pub(in crate::task_board) fn set_for_test(&mut self, card: &str, checks: Vec<String>) {
        self.generation += 1;
        self.shown = Some((card.into(), 1, checks));
    }
}

impl Board {
    pub(in crate::task_board) fn sync_owner_checks(&mut self, cx: &mut Context<Self>) {
        let report = self.snapshot.as_ref().and_then(|snapshot| {
            let card = snapshot
                .cards
                .iter()
                .find(|card| Some(&card.id) == snapshot.selected.as_ref())
                .filter(|card| card.column_id == FINAL_REVIEW && !card.archived)?;
            let version = snapshot
                .artifacts
                .iter()
                .filter(|meta| meta.card_id == card.id && meta.kind == IMPL_REPORT)
                .map(|meta| meta.version)
                .max()?;
            Some((card.id.clone(), version))
        });
        let state = &mut self.owner_checks;
        let Some((card, version)) = report else {
            state.shown = None;
            return;
        };
        if state
            .shown
            .as_ref()
            .is_some_and(|(id, shown, _)| *id == card && *shown == version)
        {
            return;
        }

        state.generation += 1;
        let generation = state.generation;
        let store = self.store.clone();
        let id = card.clone();
        let work = cx
            .background_executor()
            .spawn(async move { locked(&store)?.board_owner_checks(&id) });
        cx.spawn(async move |this, cx| {
            let result = work.await;
            let _ = this.update(cx, |this, cx| {
                let state = &mut this.owner_checks;
                if state.generation != generation {
                    return;
                }
                match result {
                    Ok(Some((version, checks))) => state.shown = Some((card, version, checks)),
                    Ok(None) => state.shown = None,
                    Err(error) => {
                        log::warn!("Board owner checks unavailable for {card}: {error}");
                        state.shown = None;
                    }
                }
                cx.notify();
            });
        })
        .detach();
    }

    pub(super) fn owner_checklist(&self, card: &Card) -> Option<AnyElement> {
        let checks = self.owner_checks.for_card(&card.id);
        if card.column_id != FINAL_REVIEW || checks.is_empty() {
            return None;
        }

        let mut list = div()
            .id("board-owner-checks")
            .debug_selector(|| "board-owner-checks".into())
            .flex()
            .flex_col()
            .gap_1()
            .text_size(px(12.))
            .child(
                div()
                    .text_color(content(0.7))
                    .child("Owner verification — not yet verified, run these before you deliver:"),
            );
        for (index, check) in checks.iter().enumerate() {
            list = list.child(
                div()
                    .id(SharedString::from(format!("board-owner-check-{index}")))
                    .debug_selector(move || format!("board-owner-check-{index}"))
                    .flex()
                    .items_start()
                    .gap_2()
                    .child(icon("circle-dashed-hi", 12.).mt(px(2.)))
                    .child(div().flex_1().min_w_0().child(check.clone())),
            );
        }
        Some(list.into_any_element())
    }
}
