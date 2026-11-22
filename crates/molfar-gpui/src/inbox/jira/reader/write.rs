//! Confirmed Jira writes: comment, edit, transition and assign.
use gpui::Context;
use molfar_core::{
    atlassian::{self, Client},
    jira,
};

use super::{JiraReader, load::write_pending};
use crate::inbox::jira::actions::Pending;

impl JiraReader {
    pub(crate) fn begin_comment(&mut self, body: String) {
        let Some(key) = self.issue.as_ref().map(|issue| issue.key.clone()) else {
            return;
        };
        self.pending = Some(Pending::Comment { key, body });
    }

    pub(crate) fn begin_edit(&mut self, cx: &mut Context<Self>) {
        let Some(issue) = self.issue.clone() else {
            return;
        };
        let summary = self.summary_input.read(cx).content.to_string();
        let description = self.description_input.read(cx).content.to_string();
        let labels = self
            .labels_input
            .read(cx)
            .content
            .split(',')
            .map(|label| label.trim().to_string())
            .filter(|label| !label.is_empty())
            .collect::<Vec<_>>();
        let description = (description != issue.description).then_some(description);
        self.pending = Some(Pending::Edit {
            key: issue.key,
            summary,
            description,
            labels,
        });
    }

    pub(super) fn load_transitions(&mut self, cx: &mut Context<Self>) {
        let Some(key) = self.issue.as_ref().map(|issue| issue.key.clone()) else {
            return;
        };
        let app = self.app.clone();
        cx.spawn(async move |this, cx| {
            let result = cx
                .background_executor()
                .spawn(async move {
                    let credentials = atlassian::load(&app)?.ok_or_else(|| {
                        atlassian::Error::Invalid("Connect Atlassian in Settings".into())
                    })?;
                    let client = Client::new(&credentials);
                    jira::issue::transitions(&client, &key)
                })
                .await;
            let _ = this.update(cx, |this, cx| {
                match result {
                    Ok(items) => {
                        this.transitions =
                            items.into_iter().map(|item| (item.id, item.name)).collect()
                    }
                    Err(error) => this.error = Some(error.to_string()),
                }
                cx.notify();
            });
        })
        .detach();
    }

    pub(crate) fn cancel(&mut self) {
        self.pending = None;
    }

    pub(crate) fn pending_prompt(&self) -> Option<String> {
        self.pending.as_ref().map(Pending::prompt)
    }

    pub(crate) fn finish_write(
        &mut self,
        result: Result<(), atlassian::Error>,
        cx: &mut Context<Self>,
    ) {
        self.writing = false;
        match result {
            Ok(()) => {
                self.writes += 1;
                self.pending = None;
                self.panel = None;
                self.comment_input
                    .update(cx, |input, cx| input.set_text(String::new(), cx));
                let _ = jira::forget_lists(&self.app, &self.site);
                if let Some(key) = self.issue.as_ref().map(|issue| issue.key.clone()) {
                    self.open(key, cx);
                }
            }
            Err(error) => self.error = Some(error.to_string()),
        }
    }

    pub(super) fn confirm(&mut self, cx: &mut Context<Self>) {
        if self.writing {
            return;
        }
        let Some(pending) = self.pending.take() else {
            return;
        };
        self.writing = true;
        let app = self.app.clone();
        let account = self.account_id.clone();
        cx.spawn(async move |this, cx| {
            let result = cx
                .background_executor()
                .spawn(async move { write_pending(&app, &pending, &account) })
                .await;
            let _ = this.update(cx, |this, cx| this.finish_write(result, cx));
        })
        .detach();
    }
}
