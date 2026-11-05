use super::{super::Board, Artifact};
use crate::{notes::preview::Preview, runtime::locked};
use gpui::{AppContext, Context, Window};
use molfar_core::task_board::types::ArtifactMeta;

impl Board {
    pub(in crate::task_board) fn open_artifact(
        &mut self,
        meta: ArtifactMeta,
        window: &mut Window,
        cx: &mut Context<Self>,
    ) {
        self.artifact_revision += 1;
        let revision = self.artifact_revision;
        let focus = cx.focus_handle();
        window.focus(&focus, cx);
        self.artifact = Some(Artifact {
            title: format!("{} · version {}", meta.kind, meta.version),
            focus,
            preview: None,
            text: None,
            error: None,
        });
        let store = self.store.clone();
        let cwd = self
            .snapshot
            .as_ref()
            .and_then(|s| s.cards.iter().find(|c| c.id == meta.card_id))
            .map(|c| c.worktree_path.as_ref().unwrap_or(&c.project_cwd).clone())
            .unwrap_or_default();
        let work = cx.background_executor().spawn(async move {
            let body =
                locked(&store)?.board_stage_artifact(&meta.card_id, &meta.kind, meta.version)?;
            let preview = Preview::new(&body, &cwd, &store);
            Ok::<_, String>((body, preview))
        });
        cx.spawn(async move |this, cx| {
            let result = work.await;
            let _ = this.update(cx, |this, cx| {
                if this.artifact_revision != revision {
                    return;
                }
                let Some(artifact) = &mut this.artifact else {
                    return;
                };
                match result {
                    Ok((body, preview)) => {
                        artifact.text = Some(body);
                        artifact.preview = Some(cx.new(|_| preview));
                    }
                    Err(error) => artifact.error = Some(error),
                }
                cx.notify();
            });
        })
        .detach();
        cx.notify();
    }

    pub(in crate::task_board) fn close_artifact(
        &mut self,
        window: &mut Window,
        cx: &mut Context<Self>,
    ) {
        self.artifact_revision += 1;
        self.artifact = None;
        window.focus(&self.focus, cx);
        cx.notify();
    }
}
