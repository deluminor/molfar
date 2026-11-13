use super::Board;
use crate::runtime::locked;
use gpui::Context;
use molfar_core::task_board::types::Snapshot;

impl Board {
    pub(crate) fn refresh(&mut self, cx: &mut Context<Self>) {
        self.revision += 1;
        let revision = self.revision;
        self.loading = true;
        self.error = None;
        let store = self.store.clone();
        let project = self
            .project_filter
            .clone()
            .or_else(|| self.project_only.then(|| self.cwd.clone()));
        let archived = self.archived;
        let selected = self.selected.clone();
        let work = cx.background_executor().spawn(async move {
            locked(&store)?.board_snapshot(project.as_deref(), archived, selected.as_deref())
        });
        cx.spawn(async move |this, cx| {
            let result = work.await;
            let _ = this.update(cx, |this, cx| this.finish(revision, result, cx));
        })
        .detach();
        cx.notify();
    }

    pub(super) fn finish(
        &mut self,
        revision: u64,
        result: Result<Snapshot, String>,
        cx: &mut Context<Self>,
    ) {
        if revision != self.revision {
            return;
        }
        self.loading = false;
        match result {
            Ok(snapshot) => {
                let artifact_missing = self.detail_tab.as_deref().is_some_and(|tab| {
                    let (Some(group), Some(card), Some(version)) = (
                        crate::task_board::detail::groups::Group::parse(tab),
                        snapshot.selected.as_ref(),
                        self.detail_version,
                    ) else {
                        return true;
                    };
                    crate::task_board::detail::groups::members(
                        &snapshot.artifacts,
                        card,
                        group,
                        version,
                    )
                    .is_empty()
                });
                if self.selected != snapshot.selected || artifact_missing {
                    self.reset_detail_artifact();
                }
                self.selected = snapshot.selected.clone();
                self.snapshot = Some(snapshot);
                self.error = None;
            }
            Err(error) => {
                if self
                    .snapshot
                    .as_ref()
                    .is_some_and(|snapshot| snapshot.cards.is_empty())
                {
                    self.snapshot = None;
                }
                self.error = Some(error);
            }
        }
        cx.notify();
    }
}
