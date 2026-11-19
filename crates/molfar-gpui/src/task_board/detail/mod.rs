mod fold;
pub(super) mod groups;
#[cfg(test)]
mod groups_tests;
mod header;
mod metadata;
#[cfg(test)]
mod navigation_tests;
pub(super) mod owner_checks;
#[cfg(test)]
mod owner_checks_tests;
mod tabs;
#[cfg(test)]
mod tests;
mod timeline;
#[cfg(test)]
mod timeline_tests;
mod turns;
#[cfg(test)]
mod turns_tests;
pub(super) mod usage;
#[cfg(test)]
mod usage_tests;
mod versions;
mod waiting;

use super::Board;
use crate::notes::preview::Preview;
use fold::Fold;
use gpui::{AppContext, Context, Entity, SharedString};

pub(super) struct Content {
    card_id: String,
    description: SharedString,
    criteria: SharedString,
    cwd: SharedString,
    description_view: Entity<Fold>,
    criteria_view: Entity<Fold>,
    generation: u64,
}

impl Board {
    pub(super) fn sync_detail_content(&mut self, cx: &mut Context<Self>) {
        if !self.drawer_open {
            return;
        }
        let Some(card) = self.snapshot.as_ref().and_then(|s| {
            s.cards
                .iter()
                .find(|c| Some(&c.id) == self.selected.as_ref())
        }) else {
            return;
        };
        let cwd = card.worktree_path.as_ref().unwrap_or(&card.project_cwd);
        let same_card = self
            .detail_content
            .as_ref()
            .is_some_and(|c| c.card_id == card.id);
        if same_card
            && self.detail_content.as_ref().is_some_and(|c| {
                c.description.as_ref() == card.description.as_str()
                    && c.criteria.as_ref() == card.acceptance_criteria.as_str()
                    && c.cwd.as_ref() == cwd.as_str()
            })
        {
            return;
        }
        let description = SharedString::from(card.description.clone());
        let criteria = SharedString::from(card.acceptance_criteria.clone());
        let cwd = SharedString::from(cwd.clone());
        if !same_card {
            self.detail_content = Some(Content {
                card_id: card.id.clone(),
                description: SharedString::default(),
                criteria: SharedString::default(),
                cwd: SharedString::default(),
                description_view: cx.new(|cx| Fold::new("description", cx)),
                criteria_view: cx.new(|cx| Fold::new("criteria", cx)),
                generation: 0,
            });
        }
        let content = self.detail_content.as_mut().expect("selected content");
        content.description = description.clone();
        content.criteria = criteria.clone();
        content.cwd = cwd.clone();
        content.generation += 1;
        let generation = content.generation;
        let store = self.store.clone();
        let work = cx.background_executor().spawn(async move {
            (
                Preview::new(&description, &cwd, &store),
                Preview::new(&criteria, &cwd, &store),
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
