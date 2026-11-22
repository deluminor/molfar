//! Handing an issue to chat, a new session or a Board card.
use gpui::Context;
use molfar_core::{
    atlassian::{self, Client},
    jira::{self, Issue},
};

use super::{Event, JiraReader};

impl JiraReader {
    pub(super) fn handoff(&mut self, card: bool, cx: &mut Context<Self>) {
        if self.project.is_empty() {
            return;
        }
        let Some(issue) = self.issue.clone() else {
            return;
        };
        let link = jira::format_issue(&self.site, &issue.key).unwrap_or_default();
        let prompt = jira::issue_markdown(&issue, false, &link);
        let title = format!("{} {}", issue.key, issue.summary);
        if card {
            let browse = format!("{}/browse/{}", self.site.trim_end_matches('/'), issue.key);
            cx.emit(Event::CreateCard {
                title,
                description: format!("{prompt}\n{browse}"),
            });
        } else {
            cx.emit(Event::StartSession { title, prompt });
        }
    }

    pub(super) fn insert_issue(&mut self, comments: bool, cx: &mut Context<Self>) {
        if self.offline {
            self.error = Some("offline: Jira is offline".into());
            cx.notify();
            return;
        }
        let Some(issue) = self.issue.clone() else {
            return;
        };
        let link = jira::format_issue(&self.site, &issue.key).unwrap_or_default();
        if comments {
            cx.emit(Event::AddToChat {
                text: jira::issue_markdown(&issue, true, &link),
            });
            return;
        }
        if issue.type_name.eq_ignore_ascii_case("epic") {
            self.insert_epic(&issue, cx);
            return;
        }
        cx.emit(Event::AddToChat {
            text: jira::issue_markdown(&issue, false, &link),
        });
    }

    pub(super) fn insert_epic(&mut self, issue: &Issue, cx: &mut Context<Self>) {
        if self.offline {
            self.error = Some("offline: Jira is offline".into());
            cx.notify();
            return;
        }
        let issue = issue.clone();
        let site = self.site.clone();
        let app = self.app.clone();
        cx.spawn(async move |this, cx| {
            let text = cx
                .background_executor()
                .spawn(async move {
                    let credentials = atlassian::load(&app)
                        .map_err(|error| error.to_string())?
                        .ok_or_else(|| "offline: Jira is not connected".to_string())?;
                    let client = Client::new(&credentials);
                    let children = jira::epic_children(&client, &issue.key, None)
                        .map_err(|error| error.to_string())?;
                    let link =
                        jira::format_issue(&site, &issue.key).map_err(|error| error.to_string())?;
                    Ok::<_, String>(jira::epic_index(
                        &format!("{} {}", issue.key, issue.summary),
                        &children,
                        &link,
                    ))
                })
                .await;
            let _ = this.update(cx, |this, cx| match text {
                Ok(text) => cx.emit(Event::AddToChat { text }),
                Err(error) => {
                    this.offline = error.starts_with("offline");
                    this.error = Some(error);
                    cx.notify();
                }
            });
        })
        .detach();
    }
}
