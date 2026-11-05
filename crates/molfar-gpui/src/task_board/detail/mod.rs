mod fold;
mod header;
mod metadata;
#[cfg(test)]
mod navigation_tests;
mod tabs;
#[cfg(test)]
mod tests;
mod timeline;
#[cfg(test)]
mod timeline_tests;

use super::Board;
use crate::notes::preview::Preview;
use fold::Fold;
use gpui::{AppContext, Context, Entity};

pub(super) struct Content {
    card_id: String,
    description: String,
    criteria: String,
    cwd: String,
    description_view: Entity<Fold>,
    criteria_view: Entity<Fold>,
    generation: u64,
}

impl Board {
    pub(super) fn sync_detail_content(&mut self, cx: &mut Context<Self>) {
        if !self.drawer_open {
            return;
        }
        let Some(card) = self
            .snapshot
            .as_ref()
            .and_then(|s| {
                s.cards
                    .iter()
                    .find(|c| Some(&c.id) == self.selected.as_ref())
            })
            .cloned()
        else {
            return;
        };
        let cwd = card
            .worktree_path
            .as_ref()
            .unwrap_or(&card.project_cwd)
            .clone();
        let same_card = self
            .detail_content
            .as_ref()
            .is_some_and(|c| c.card_id == card.id);
        if same_card
            && self.detail_content.as_ref().is_some_and(|c| {
                c.description == card.description
                    && c.criteria == card.acceptance_criteria
                    && c.cwd == cwd
            })
        {
            return;
        }
        if !same_card {
            self.detail_content = Some(Content {
                card_id: card.id.clone(),
                description: String::new(),
                criteria: String::new(),
                cwd: String::new(),
                description_view: cx.new(|cx| Fold::new("description", cx)),
                criteria_view: cx.new(|cx| Fold::new("criteria", cx)),
                generation: 0,
            });
        }
        let content = self.detail_content.as_mut().expect("selected content");
        content.description = card.description.clone();
        content.criteria = card.acceptance_criteria.clone();
        content.cwd = cwd.clone();
        content.generation += 1;
        let generation = content.generation;
        let store = self.store.clone();
        let work = cx.background_executor().spawn(async move {
            (
                Preview::new(&card.description, &cwd, &store),
                Preview::new(&card.acceptance_criteria, &cwd, &store),
            )
        });
        let card_id = content.card_id.clone();
        let view_id = content.description_view.entity_id();
        cx.spawn(async move |this, cx| {
            let (description, criteria) = work.await;
            let _ = this.update(cx, |this, cx| {
                this.finish_detail_content(
                    &card_id,
                    generation,
                    view_id,
                    (description, criteria),
                    cx,
                );
            });
        })
        .detach();
    }

    fn finish_detail_content(
        &mut self,
        card_id: &str,
        generation: u64,
        view_id: gpui::EntityId,
        previews: (Preview, Preview),
        cx: &mut Context<Self>,
    ) {
        let Some(content) = &self.detail_content else {
            return;
        };
        if content.card_id != card_id
            || content.generation != generation
            || content.description_view.entity_id() != view_id
        {
            return;
        }
        let description_view = content.description_view.clone();
        let criteria_view = content.criteria_view.clone();
        let description = cx.new(|_| previews.0);
        let criteria = cx.new(|_| previews.1);
        description_view.update(cx, |fold, cx| {
            fold.preview = Some(description);
            cx.notify();
        });
        criteria_view.update(cx, |fold, cx| {
            fold.preview = Some(criteria);
            cx.notify();
        });
        cx.notify();
    }
}
