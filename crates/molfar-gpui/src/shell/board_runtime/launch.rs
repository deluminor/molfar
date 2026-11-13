use super::*;
use molfar_core::task_board::{
    stage::{agent::AgentStage, choice, lifecycle::types::StageEffect},
    types::Card,
};

impl Shell {
    pub(super) fn launch_board_claim(
        &mut self,
        card: Card,
        raw_settings: Option<String>,
        cx: &mut Context<Self>,
    ) {
        if self.board_state.preparing.contains_key(&card.id) {
            return;
        }
        let prefs = &self.workspace.preferences;
        let default = prefs
            .project_providers
            .get(&card.project_cwd)
            .and_then(|value| value.provider.as_deref())
            .or(prefs.default_provider.as_deref())
            .and_then(Kind::parse)
            .unwrap_or(Kind::Codex);
        let Some(stage) = AgentStage::parse(&card.column_id) else {
            self.fail_board_claim(card, "Unsupported Board stage.".into(), cx);
            return;
        };
        let selection = match choice::select(
            stage,
            raw_settings.as_deref(),
            &card.overrides_json,
            default,
        ) {
            Ok(selection) => selection,
            Err(error) => {
                self.fail_board_claim(card, error, cx);
                return;
            }
        };
        let kind = selection.kind;
        let model = prefs
            .project_providers
            .get(&card.project_cwd)
            .and_then(|value| value.models.get(kind.id()))
            .or(prefs.default_models.get(kind.id()))
            .cloned();
        let account = crate::accounts::get(cx)
            .map(|accounts| accounts.read(cx).selected(kind, &card.project_cwd))
            .unwrap_or_default();
        let defaults = prepare::Defaults {
            #[cfg(test)]
            fixture: self.board_state.fixture.clone(),
            card: card.clone(),
            selection,
            model,
            account,
            disabled_skills: prefs.disabled_skill_paths.clone(),
        };
        let run = molfar_core::familiar::new_id();
        self.board_state
            .preparing
            .insert(card.id.clone(), run.clone());
        let store = self.store.clone();
        let request = run.clone();
        let work = cx
            .background_executor()
            .spawn(async move { prepare::prepare(&store, &request, defaults) });
        cx.spawn(async move |this, cx| {
            let result = work.await;
            let _ = this.update(cx, |this, cx| {
                if this.board_state.preparing.get(&card.id) != Some(&run) {
                    return;
                }
                match result {
                    Ok(prepare::Prepared::Launch(launch)) => {
                        this.install_board_launch(card.id.clone(), *launch, cx);
                        return;
                    }
                    Ok(prepare::Prepared::Failed(effect)) => this.apply_board_effect(*effect, cx),
                    Ok(prepare::Prepared::Stopped) => (),
                    Err(error) => this.error = Some(format!("Task Board preparation: {error}")),
                }
                this.board_state.preparing.remove(&card.id);
                this.poll_board(true, cx);
                this.refresh_board(cx);
            });
        })
        .detach();
    }

    fn fail_board_claim(&mut self, card: Card, error: String, cx: &mut Context<Self>) {
        let claim = molfar_core::familiar::new_id();
        self.board_state
            .preparing
            .insert(card.id.clone(), claim.clone());
        let store = self.store.clone();
        let id = card.id.clone();
        let work = cx.background_executor().spawn(async move {
            locked(&store)?.board_fail_claimed_stage(&card.id, card.updated_at, &error)
        });
        cx.spawn(async move |this, cx| {
            let result = work.await;
            let _ = this.update(cx, |this, cx| {
                if this.board_state.preparing.get(&id) == Some(&claim) {
                    this.board_state.preparing.remove(&id);
                }
                match result {
                    Ok(effect) => this.apply_board_effect(effect, cx),
                    Err(error) => this.error = Some(error),
                }
                this.poll_board(true, cx);
            });
        })
        .detach();
    }

    pub(super) fn apply_board_effect(&mut self, effect: StageEffect, cx: &mut Context<Self>) {
        if let Some(notice) = effect.notice {
            self.board_notice(notice, cx);
        }
        self.refresh_board(cx);
    }

    pub(super) fn install_board_launch(
        &mut self,
        card: String,
        launch: prepare::Launch,
        cx: &mut Context<Self>,
    ) {
        let store = self.store.clone();
        let run = launch.run_id.clone();
        let work = cx
            .background_executor()
            .spawn(async move { locked(&store)?.board_stage_is_current(&run) });
        cx.spawn(async move |this, cx| {
            let result = work.await;
            let _ = this.update(cx, |this, cx| {
                if this.board_state.preparing.get(&card) != Some(&launch.run_id) {
                    return;
                }
                let compacting = match result {
                    Ok(true) => this.install_current_board_launch(card.clone(), launch, cx),
                    Ok(false) => false,
                    Err(error) => {
                        this.error = Some(format!("Task Board launch: {error}"));
                        false
                    }
                };
                // A compacting session keeps its claim protected until its prompt is sent.
                if !compacting {
                    this.board_state.preparing.remove(&card);
                }
                this.poll_board(true, cx);
            });
        })
        .detach();
    }

    /// Returns true while a reused session compacts; its prompt follows in `send_after_compaction`.
    fn install_current_board_launch(
        &mut self,
        card: String,
        launch: prepare::Launch,
        cx: &mut Context<Self>,
    ) -> bool {
        #[cfg(test)]
        if let Some(registration) = launch.registration {
            self.board_state.registrations.push(registration);
        }
        let id = launch.summary.id;
        self.board_state.running.insert(id, launch.run_id.clone());
        self.board_state.owned.insert(id);
        if !launch.reused {
            self.draft_sessions.insert(id);
        }
        self.sidebar_hidden_sessions.remove(&id);
        self.session_worktrees
            .insert(id, launch.settings.worktree_cwd.clone());
        self.add(launch.summary, cx);
        if !launch.warnings.is_empty() {
            self.error = Some(launch.warnings.join(" · "));
        }
        let mut compacting = false;
        if let Some(view) = self.sessions.get(&id).cloned() {
            if launch.compact {
                view.update(cx, |view, cx| view.compact_context(cx));
                compacting = view.read(cx).external_submission_pending();
            }
            if compacting {
                let pending = (card, launch.run_id.clone(), launch.settings);
                self.board_state.compacting.insert(id, pending);
            } else if launch.reused {
                view.update(cx, |view, cx| {
                    view.install_queued_app_launch(launch.settings, cx)
                });
            } else {
                view.update(cx, |view, cx| {
                    view.install_app_launch(launch.settings, true, cx)
                });
            }
        }
        let store = self.store.clone();
        let work = cx
            .background_executor()
            .spawn(async move { locked(&store)?.board_stage_is_current(&launch.run_id) });
        cx.spawn(async move |this, cx| {
            let result = work.await;
            let _ = this.update(cx, |this, cx| {
                match result {
                    Ok(false) => {
                        if let Some((card, run, _)) = this.board_state.compacting.remove(&id) {
                            this.release_board_claim(&card, &run);
                        }
                        if let Some(view) = this.sessions.get(&id) {
                            view.update(cx, |view, cx| view.stop_app_session(cx));
                        }
                    }
                    Ok(true) => (),
                    Err(error) => {
                        this.error = Some(error);
                        if let Some((card, run, _)) = this.board_state.compacting.remove(&id) {
                            this.release_board_claim(&card, &run);
                        }
                        if let Some(view) = this.sessions.get(&id) {
                            view.update(cx, |view, cx| view.stop_app_session(cx));
                        }
                    }
                }
                this.board_session_changed(id, cx);
            });
        })
        .detach();
        compacting
    }
}
