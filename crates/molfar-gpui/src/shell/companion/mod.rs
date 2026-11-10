//! Answers BitChain Companion RPCs on the shell, the same actions the Tauri
//! window used to run.
use super::*;
use crate::companion::{Host, Job};
use molfar_core::{
    agent::{AccessMode, Decision},
    provider::Kind,
};
use serde_json::{Value, json};
use std::collections::HashMap;

mod actions;
mod blocks;
use blocks::block;
mod launch;
mod notes;
mod overview;
mod transcript;
mod types;
mod vault;
use types::*;

impl Shell {
    pub(super) fn init_companion(&mut self, cx: &mut Context<Self>) {
        if cx.is_test() {
            return;
        }
        let Some(path) = locked(&self.store)
            .ok()
            .and_then(|store| store.data_dir().map(|dir| dir.join("companion.json")))
        else {
            return;
        };
        let (host, jobs) = match Host::open(path) {
            Ok(opened) => opened,
            Err(error) => {
                self.error = Some(format!("Companion: {error}"));
                return;
            }
        };
        self.companion = Some(host);
        cx.on_app_quit(|this, _| {
            if let Some(host) = &this.companion {
                host.shutdown();
            }
            async {}
        })
        .detach();
        cx.spawn(async move |this, cx| {
            while let Ok(job) = jobs.recv().await {
                this.update(cx, |this, cx| this.dispatch_companion_job(job, cx))
                    .ok();
            }
        })
        .detach();
    }

    pub(super) fn companion_status(&self) -> Option<crate::companion::Status> {
        self.companion.as_ref().and_then(|host| host.status().ok())
    }

    pub(super) fn companion_configure(&mut self, enabled: bool, port: u16, cx: &mut Context<Self>) {
        let Some(host) = self.companion.clone() else {
            return;
        };
        if let Err(error) = host.set_enabled(enabled, port) {
            self.error = Some(error);
        }
        if !enabled {
            self.companion_offer = None;
        }
        self.sync_settings(cx);
    }

    pub(super) fn companion_live_offer(&self) -> Option<crate::companion::Offer> {
        self.companion_offer
            .clone()
            .filter(|offer| offer.expires_at > now_ms())
    }

    pub(super) fn companion_pair(
        &mut self,
        cx: &mut Context<Self>,
    ) -> Option<crate::companion::Offer> {
        let started = self.companion.as_ref().map(|host| host.pair_start());
        let offer = match started {
            Some(Ok(offer)) => Some(offer),
            Some(Err(error)) => {
                self.error = Some(error);
                None
            }
            None => None,
        };
        self.companion_offer = offer.clone();
        self.sync_settings(cx);
        offer
    }

    pub(super) fn companion_cancel_pair(&mut self, cx: &mut Context<Self>) {
        if let Some(host) = &self.companion {
            let _ = host.pair_cancel();
        }
        self.companion_offer = None;
        self.sync_settings(cx);
    }

    pub(super) fn companion_revoke(&mut self, id: &str, cx: &mut Context<Self>) {
        if let Some(Err(error)) = self.companion.as_ref().map(|host| host.revoke(id)) {
            self.error = Some(error);
        }
        self.sync_settings(cx);
    }

    pub(super) fn companion_rpc(
        &mut self,
        action: &str,
        input: &Value,
        cx: &mut Context<Self>,
    ) -> Value {
        match self.companion_action(action, input, cx) {
            Ok(result) => json!({"ok": true, "result": result}),
            Err(error) => json!({"ok": false, "error": error}),
        }
    }

    fn dispatch_companion_job(&mut self, job: Job, cx: &mut Context<Self>) {
        if let Err(error) = job.permit.check() {
            let _ = job.reply.send(json!({"ok":false,"error":error}));
            return;
        }
        if matches!(job.action.as_str(), "session.options" | "session.start") {
            self.companion_launch_job(job, cx);
        } else if matches!(
            job.action.as_str(),
            "vault.index" | "vault.read" | "vault.write"
        ) {
            self.companion_vault_job(job, cx);
        } else {
            let response = self.companion_rpc(&job.action, &job.input, cx);
            let _ = job.reply.send(response);
        }
    }

    pub(super) fn companion_action(
        &mut self,
        action: &str,
        input: &Value,
        cx: &mut Context<Self>,
    ) -> Result<Value, String> {
        if action == "board.session" || action.starts_with("board.") {
            return Err("Task Board is not available from the phone on MOLFAR Native yet".into());
        }
        match action {
            "overview" => self.companion_overview(cx),
            "familiar.transcript" => self.companion_transcript(
                Target::Familiar(required(input, "familiarId")?),
                input,
                cx,
            ),
            "session.transcript" => {
                self.companion_transcript(Target::Session(session_id(input)?), input, cx)
            }
            "familiar.send" => {
                let text = message_text(input)?;
                let id = required(input, "familiarId")?;
                self.familiars
                    .as_ref()
                    .ok_or("Familiar not found")?
                    .update(cx, |familiars, cx| {
                        familiars.mobile_send(&id, text, Vec::new(), cx)
                    })?;
                Ok(json!({"sent": true}))
            }
            "session.send" => {
                let text = message_text(input)?;
                let view = self.companion_view(input, cx)?;
                view.update(cx, |view, cx| view.mobile_submit(text, Vec::new(), cx));
                Ok(json!({"sent": true}))
            }
            "session.stop" => {
                let view = self.companion_view(input, cx)?;
                view.update(cx, |view, cx| view.stop_app_session(cx));
                Ok(json!({"stopped": true}))
            }
            "session.mode" => {
                let mode = input["runtimeMode"].as_str().unwrap_or("");
                if !matches!(
                    mode,
                    "supervised" | "auto-accept-edits" | "auto" | "full-access"
                ) {
                    return Err(
                        "runtimeMode must be one of supervised, auto-accept-edits, auto, full-access"
                            .into(),
                    );
                }
                let view = self.companion_view(input, cx)?;
                view.update(cx, |view, cx| {
                    view.mobile_configure(
                        None,
                        &HashMap::new(),
                        Some(AccessMode::from_id(mode)),
                        cx,
                    );
                });
                Ok(json!({"runtimeMode": mode}))
            }
            "approval.respond" => self.companion_approval(input, cx),
            "question.answer" => self.companion_question(input, cx),
            "notes.list" => self.companion_notes_list(input),
            "notes.read" => self.companion_notes_read(input),
            "notes.create" => self.companion_notes_create(input),
            _ => Err("Unknown Companion action".into()),
        }
    }
}

#[cfg(test)]
mod tests;
