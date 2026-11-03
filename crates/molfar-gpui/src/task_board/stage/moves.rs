use super::super::{Board, Event, review::Mode};
use super::back::{back_label, column_label};
#[cfg(test)]
#[path = "moves_tests.rs"]
mod tests;
use crate::modal;
use crate::popover::{Anchor, Menu, MenuAction, MenuEvent, menu_popover};
use gpui::{AnyElement, AppContext, Context, Window, div, prelude::*};
use molfar_core::task_board::{
    stage::{
        lifecycle::types::StageAction,
        transitions::{
            moves::legal_moves,
            types::{BoardAction, Move, Position},
        },
    },
    types::Card,
};

impl Board {
    /// Desktop drop targets, minus Back when the readable-review guard would refuse it.
    pub(in crate::task_board) fn card_moves(&self, card: &Card) -> Vec<Move> {
        let position = Position {
            column: &card.column_id,
            run_state: &card.run_state,
            archived: card.archived,
        };
        let back = back_label(card, self.snapshot.as_ref()).is_some();
        legal_moves(position)
            .into_iter()
            .filter(|target| target.action != BoardAction::Back || back)
            .collect()
    }

    pub(in crate::task_board) fn move_action(
        &self,
        card: &Card,
        pending: bool,
        cx: &mut Context<Self>,
    ) -> Option<AnyElement> {
        if self.card_moves(card).is_empty() {
            return None;
        }
        let picked = card.clone();
        let anchor = self.move_anchor.clone();
        Some(
            div()
                .child(anchor.probe())
                .child(
                    modal::disabled(modal::ghost_button("board-move-to", "Move to…"), pending)
                        .debug_selector(|| "board-move-to".into())
                        .on_click(cx.listener(move |this, _, window, cx| {
                            this.open_moves(&picked, window, cx)
                        })),
                )
                .into_any_element(),
        )
    }

    fn open_moves(&mut self, card: &Card, window: &mut Window, cx: &mut Context<Self>) {
        if self.stage_pending.is_some() {
            return;
        }
        let items = self
            .card_moves(card)
            .into_iter()
            .map(|target| {
                MenuAction::new(
                    target.column.clone(),
                    column_label(&target.column).to_owned(),
                )
                .into()
            })
            .collect();
        let menu = cx.new(|cx| Menu::new("Move card to", items, window, cx));
        let card = card.clone();
        let subscription = cx.subscribe_in(
            &menu,
            window,
            move |this, _, event: &MenuEvent, window, cx| {
                this.move_menu = None;
                match event {
                    MenuEvent::Picked(column, _) => this.apply_move(&card, column, window, cx),
                    MenuEvent::Dismissed => window.focus(&this.focus, cx),
                }
                cx.notify();
            },
        );
        self.move_menu = Some(menu);
        self.move_subscription = Some(subscription);
        cx.notify();
    }

    /// Moves that need owner input open the same panel desktop opens after a drop.
    pub(in crate::task_board) fn apply_move(
        &mut self,
        card: &Card,
        column: &str,
        window: &mut Window,
        cx: &mut Context<Self>,
    ) {
        let current = self
            .snapshot
            .as_ref()
            .and_then(|snapshot| snapshot.cards.iter().find(|entry| entry.id == card.id))
            .cloned()
            .unwrap_or_else(|| card.clone());
        let card = &current;
        let Some(target) = self
            .card_moves(card)
            .into_iter()
            .find(|target| target.column == column)
        else {
            return;
        };
        let immediate = match target.action {
            BoardAction::Start => Some(StageAction::Start),
            BoardAction::ApprovePlan => Some(StageAction::ApprovePlan),
            BoardAction::Back => Some(StageAction::Back),
            BoardAction::RequestChanges => {
                return self.open_owner_review(card.id.clone(), Mode::Questions, window, cx);
            }
            BoardAction::Rework => {
                return self.open_owner_review(card.id.clone(), Mode::Rework, window, cx);
            }
            BoardAction::Deliver => return self.open_delivery(card, cx),
            _ => None,
        };
        let Some(action) = immediate else {
            return;
        };
        if self.stage_pending.is_some() {
            return;
        }
        self.stage_pending = Some(card.id.clone());
        cx.emit(Event::Stage {
            card_id: card.id.clone(),
            updated_at: card.updated_at,
            action,
        });
    }

    pub(in crate::task_board) fn moves_overlay(
        &self,
        window: &Window,
        cx: &mut Context<Self>,
    ) -> Option<AnyElement> {
        let menu = self.move_menu.as_ref()?;
        let popover = menu_popover(menu, Anchor::Slot(self.move_anchor.clone()), cx);
        let overlay = div().absolute().inset_0().child(popover);
        Some(modal::window_overlay(window, overlay).into_any_element())
    }
}
