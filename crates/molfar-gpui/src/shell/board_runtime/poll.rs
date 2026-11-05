use super::settle;
use super::*;
use molfar_core::task_board::{
    stage::lifecycle::types::{FailureStatus, StageEffect, StageNotice},
    types::Card,
};

pub(super) struct Poll {
    pub card: Option<Card>,
    pub effects: Vec<StageEffect>,
    pub notices: Vec<StageNotice>,
    pub owned: HashSet<i64>,
    pub attention: usize,
    pub active_runs: HashSet<String>,
    pub deferred: Vec<String>,
    pub settings: Option<String>,
}

impl Shell {
    pub(super) fn poll_board(&mut self, run: bool, cx: &mut Context<Self>) {
        if self.board_state.polling {
            self.board_state.again |= run;
            return;
        }
        self.board_state.polling = true;
        let store = self.store.clone();
        let protected: HashSet<_> = self.board_state.preparing.values().cloned().collect();
        let cards: HashSet<_> = self.board_state.preparing.keys().cloned().collect();
        let active: HashSet<_> = self
            .sessions
            .iter()
            .filter_map(|(&id, view)| view.read(cx).external_submission_pending().then_some(id))
            .collect();
        let work = cx
            .background_executor()
            .spawn(async move { poll(&store, run, &protected, &cards, &active) });
        cx.spawn(async move |this, cx| {
            let result = work.await;
            let _ = this.update(cx, |this, cx| {
                this.board_state.polling = false;
                match result {
                    Ok(result) => {
                        this.board_state.ownership_ready = true;
                        this.board_state.owned = result.owned;
                        this.board_state.attention = result.attention;
                        this.board_state
                            .running
                            .retain(|_, run| result.active_runs.contains(run));
                        for effect in result.effects {
                            if let Some(notice) = effect.notice {
                                this.board_notice(notice, cx);
                            }
                        }
                        for notice in result.notices {
                            this.board_notice(notice, cx);
                        }
                        if let Some(card) = result.card {
                            this.launch_board_claim(card, result.settings, cx);
                            this.board_state.again = true;
                        }
                        if !result.deferred.is_empty() {
                            this.error =
                                Some(format!("Task Board: {}", result.deferred.join(" · ")));
                        }
                        this.refresh_board(cx);
                    }
                    Err(error) => {
                        this.error = Some(format!("Task Board: {error}"));
                        cx.notify();
                    }
                }
                if std::mem::take(&mut this.board_state.again) {
                    this.poll_board(true, cx);
                }
            });
        })
        .detach();
    }
}

fn poll(
    store: &Database,
    run: bool,
    protected: &HashSet<String>,
    cards: &HashSet<String>,
    sessions: &HashSet<i64>,
) -> Result<Poll, String> {
    if locked(store)?.desktop_preferences().is_none() {
        return Ok(Poll {
            card: None,
            effects: Vec::new(),
            notices: Vec::new(),
            owned: HashSet::new(),
            attention: 0,
            active_runs: HashSet::new(),
            deferred: Vec::new(),
            settings: None,
        });
    }
    let active = sessions
        .iter()
        .map(|&id| locked(store)?.persisted_session_id(id))
        .collect::<Result<HashSet<_>, _>>()?;
    let mut effects = Vec::new();
    let mut deferred = Vec::new();
    if run {
        effects.extend(locked(store)?.board_reconcile_orphan_claims(cards)?);
        let contexts = locked(store)?.board_running_stages()?;
        for context in contexts {
            if protected.contains(&context.run.id) {
                continue;
            }
            if !locked(store)?.board_stage_is_current(&context.run.id)? {
                continue;
            }
            let effect = match settle::settle(store, &context, &active) {
                Ok(effect) => effect,
                Err(error) if settle::is_active(&context, &active) => {
                    deferred.push(error);
                    continue;
                }
                Err(error) => locked(store)?.board_fail_stage(
                    &context.run.id,
                    FailureStatus::Interrupted,
                    &error,
                )?,
            };
            effects.push(effect);
        }
    }
    let mut store = locked(store)?;
    let owned = store.board_owned_session_ids()?;
    let attention = store.board_attention()?;
    let notices = if run {
        store.board_take_stall_notices(molfar_core::time::now_ms())?
    } else {
        Vec::new()
    };
    let active_runs = store
        .board_running_stages()?
        .into_iter()
        .map(|context| context.run.id)
        .collect();
    let settings = store.board_settings_json()?;
    let card = if run {
        store.board_claim_next_stage()?
    } else {
        None
    };
    Ok(Poll {
        card,
        effects,
        notices,
        owned,
        attention,
        active_runs,
        deferred,
        settings,
    })
}
