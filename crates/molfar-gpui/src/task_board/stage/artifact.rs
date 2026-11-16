use super::{super::Board, Artifact, Section};
use crate::{notes::preview::Preview, runtime::locked};
use gpui::{AppContext, Context, Window};
use molfar_core::task_board::types::ArtifactMeta;

impl Board {
    /// Loads every section of one group version together, so the reader never sees half a round.
    pub(in crate::task_board) fn open_artifact(
        &mut self,
        members: Vec<(&'static str, ArtifactMeta)>,
        window: &mut Window,
        cx: &mut Context<Self>,
    ) {
        self.artifact_revision += 1;
        let revision = self.artifact_revision;
        let focus = cx.focus_handle();
        window.focus(&focus, cx);
        self.artifact = Some(Artifact {
            focus,
            sections: None,
            error: None,
        });

        let store = self.store.clone();
        let cwd = self
            .snapshot
            .as_ref()
            .and_then(|s| {
                let card_id = &members.first()?.1.card_id;
                s.cards.iter().find(|c| &c.id == card_id)
            })
            .map(|c| c.worktree_path.as_ref().unwrap_or(&c.project_cwd).clone())
            .unwrap_or_default();
        let work = cx.background_executor().spawn(async move {
            members
                .into_iter()
                .map(|(heading, meta)| {
                    let body = locked(&store)?.board_stage_artifact(
                        &meta.card_id,
                        &meta.kind,
                        meta.version,
                    )?;
                    Ok((heading, Preview::new(&body, &cwd, &store)))
                })
                .collect::<Result<Vec<_>, String>>()
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
                    Ok(previews) => {
                        artifact.sections = Some(
                            previews
                                .into_iter()
                                .map(|(heading, preview)| Section {
                                    heading,
                                    preview: cx.new(|_| preview),
                                })
                                .collect(),
                        );
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
