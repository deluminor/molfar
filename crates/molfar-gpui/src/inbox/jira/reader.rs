use std::{collections::HashSet, path::PathBuf};

use gpui::{Context, EventEmitter, IntoElement, Render, Window, div, prelude::*, px};
use molfar_core::{
    atlassian::{self, Client},
    jira::{self, Issue},
};

use crate::knowledge::{self, PreviewHost};

use super::actions::Pending;

pub(crate) enum Event {
    StartSession { title: String, prompt: String },
    CreateCard { title: String, description: String },
    AddToChat { text: String },
}

pub(crate) struct JiraReader {
    app: PathBuf,
    project: String,
    issue: Option<Issue>,
    site: String,
    loading: bool,
    error: Option<String>,
    newest: bool,
    pending: Option<Pending>,
    callouts: HashSet<usize>,
    account_id: String,
    draft: String,
    writes: u32,
}

impl EventEmitter<Event> for JiraReader {}

impl PreviewHost for JiraReader {
    fn callout_open(&self, index: usize) -> bool {
        self.callouts.contains(&index)
    }

    fn toggle_callout(&mut self, index: usize) {
        if !self.callouts.remove(&index) {
            self.callouts.insert(index);
        }
    }

    fn flip_task(&mut self, _ordinal: usize, cx: &mut Context<Self>) {
        cx.notify();
    }
}

impl JiraReader {
    pub(crate) fn new(app: PathBuf) -> Self {
        Self {
            app,
            project: String::new(),
            issue: None,
            site: String::new(),
            loading: false,
            error: None,
            newest: true,
            pending: None,
            callouts: HashSet::new(),
            account_id: String::new(),
            draft: String::new(),
            writes: 0,
        }
    }

    pub(crate) fn set_project(&mut self, project: String) {
        self.project = project;
    }

    fn handoff(&mut self, card: bool, cx: &mut Context<Self>) {
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

    pub(crate) fn open(&mut self, key: String, cx: &mut Context<Self>) {
        self.loading = true;
        self.error = None;
        self.pending = None;
        let app = self.app.clone();
        cx.spawn(async move |this, cx| {
            let loaded = cx
                .background_executor()
                .spawn(async move { fetch(&app, &key) })
                .await;
            let _ = this.update(cx, |this, cx| {
                this.loading = false;
                match loaded {
                    Ok((site, issue, account)) => {
                        this.site = site;
                        this.account_id = account;
                        this.issue = Some(issue);
                    }
                    Err(error) => this.error = Some(error.to_string()),
                }
                cx.notify();
            });
        })
        .detach();
        cx.notify();
    }

    pub(crate) fn begin_comment(&mut self, body: String) {
        let Some(key) = self.issue.as_ref().map(|issue| issue.key.clone()) else {
            return;
        };
        self.pending = Some(Pending::Comment { key, body });
    }

    pub(crate) fn begin_edit(&mut self) {
        let Some(issue) = self.issue.clone() else {
            return;
        };
        self.pending = Some(Pending::Edit {
            key: issue.key,
            summary: issue.summary,
            description: issue.description,
            labels: issue.labels,
        });
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
        match result {
            Ok(()) => {
                self.writes += 1;
                self.pending = None;
                if let Some(key) = self.issue.as_ref().map(|issue| issue.key.clone()) {
                    self.open(key, cx);
                }
            }
            Err(error) => self.error = Some(error.to_string()),
        }
    }

    fn confirm(&mut self, cx: &mut Context<Self>) {
        let Some(pending) = self.pending.clone() else {
            return;
        };
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

fn fetch(app: &std::path::Path, key: &str) -> Result<(String, Issue, String), atlassian::Error> {
    let credentials = atlassian::load(app)?
        .ok_or_else(|| atlassian::Error::Invalid("Connect Atlassian in Settings".into()))?;
    let client = Client::new(&credentials);
    let sprint = jira::sprint_field(&client).ok().flatten();
    let issue = jira::issue::load(&client, key, sprint.as_deref())?;
    let account = jira::issue::account_id(&client).unwrap_or_default();
    for attachment in &issue.attachments {
        if let Ok(bytes) =
            client.bytes(&format!("/rest/api/3/attachment/content/{}", attachment.id))
        {
            let _ = jira::store_media(app, credentials.site(), &attachment.id, &bytes);
        }
    }
    Ok((credentials.site().to_string(), issue, account))
}

fn write_pending(
    app: &std::path::Path,
    pending: &Pending,
    account: &str,
) -> Result<(), atlassian::Error> {
    let credentials = atlassian::load(app)?
        .ok_or_else(|| atlassian::Error::Invalid("Connect Atlassian in Settings".into()))?;
    let client = Client::new(&credentials);
    match pending {
        Pending::Comment { key, body } => jira::issue::comment(&client, key, body),
        Pending::Transition { key, id, .. } => jira::issue::transition(&client, key, id),
        Pending::Assign { key } => jira::issue::assign(&client, key, account),
        Pending::Edit {
            key,
            summary,
            description,
            labels,
        } => jira::issue::edit(&client, key, summary, description, labels),
    }
}

fn shown_markdown(issue: &Issue, media_root: &std::path::Path) -> String {
    let mut markdown = issue.description.clone();
    for attachment in &issue.attachments {
        let token = format!("attachment://{}", attachment.id);
        let file = media_root.join(&attachment.id);
        let replacement = if file.is_file() {
            format!("molfar-asset:{}", attachment.id)
        } else {
            attachment.name.clone()
        };
        markdown = markdown.replace(&token, &replacement);
    }
    markdown
}

impl Render for JiraReader {
    fn render(&mut self, _window: &mut Window, cx: &mut Context<Self>) -> impl IntoElement {
        if self.loading && self.issue.is_none() {
            return div()
                .size_full()
                .p_4()
                .child(knowledge::orbit_loader(
                    "jira-orbit",
                    "Loading…".into(),
                    None,
                ))
                .child(knowledge::skeleton_rows("jira-skeleton"))
                .into_any_element();
        }
        let Some(issue) = self.issue.clone() else {
            return div().p_4().child("Select a Jira issue").into_any_element();
        };
        let mut comments = issue.comments.clone();
        jira::issue::sort_comments(&mut comments, self.newest);
        let media = self
            .app
            .join("jira-cache")
            .join(jira::link::host_of(&self.site))
            .join("media");
        let body = if issue.description.trim().is_empty() {
            vec![div().child("No description").into_any_element()]
        } else {
            knowledge::render_markdown(self, &shown_markdown(&issue, &media), Some(&media), cx)
        };
        let browse = format!("{}/browse/{}", self.site.trim_end_matches('/'), issue.key);
        let link = jira::format_issue(&self.site, &issue.key).unwrap_or_default();
        let prompt = self.pending_prompt();
        div()
            .id("jira-reader")
            .size_full()
            .flex()
            .flex_col()
            .gap_2()
            .p_3()
            .overflow_y_scroll()
            .when_some(self.error.clone(), |pane, error| {
                pane.child(knowledge::banner("jira-error", 0.0, "alert-circle", error))
            })
            .child(format!(
                "{}  {}  {}  {}  {}",
                issue.key, issue.type_name, issue.status, issue.priority, issue.summary
            ))
            .child(format!(
                "Assignee {}  Reporter {}  Sprint {}  Epic {}",
                issue.assignee, issue.reporter, issue.sprint, issue.epic
            ))
            .child(format!(
                "Labels {}  Components {}  Fix versions {}",
                issue.labels.join(", "),
                issue.components.join(", "),
                issue.fix_versions.join(", ")
            ))
            .child(format!(
                "Created {}  Updated {}  Due {}  Resolution {}",
                issue.created, issue.updated, issue.due, issue.resolution
            ))
            .children(body)
            .child(if issue.subtasks.is_empty() {
                "No sub-tasks".to_string()
            } else {
                issue
                    .subtasks
                    .iter()
                    .map(|item| format!("{} {} {}", item.key, item.status, item.summary))
                    .collect::<Vec<_>>()
                    .join("\n")
            })
            .child(if issue.links.is_empty() {
                "No links".to_string()
            } else {
                issue
                    .links
                    .iter()
                    .map(|item| {
                        format!(
                            "{} {} {} {}",
                            item.relation, item.key, item.status, item.summary
                        )
                    })
                    .collect::<Vec<_>>()
                    .join("\n")
            })
            .child(if issue.attachments.is_empty() {
                "No attachments".to_string()
            } else {
                issue
                    .attachments
                    .iter()
                    .map(|item| format!("{} {}", item.name, item.size))
                    .collect::<Vec<_>>()
                    .join("\n")
            })
            .child(format!(
                "Time spent {}  Original {}  Remaining {}  {} more entries",
                issue.work.spent, issue.work.original, issue.work.remaining, issue.work.more
            ))
            .child(if comments.is_empty() {
                "No comments".to_string()
            } else {
                comments
                    .iter()
                    .map(|comment| format!("{} {}", comment.author, comment.body))
                    .collect::<Vec<_>>()
                    .join("\n")
            })
            .child(
                div()
                    .flex()
                    .gap_2()
                    .child(chip("Open in Jira", cx, {
                        let browse = browse.clone();
                        move |_, cx| cx.open_url(&browse)
                    }))
                    .child(chip("Copy key", cx, {
                        let key = issue.key.clone();
                        move |_, cx| {
                            cx.write_to_clipboard(gpui::ClipboardItem::new_string(key.clone()))
                        }
                    }))
                    .child(chip("Copy link", cx, {
                        let link = link.clone();
                        move |_, cx| {
                            cx.write_to_clipboard(gpui::ClipboardItem::new_string(link.clone()))
                        }
                    }))
                    .child(chip("Comment", cx, |this, cx| {
                        let body = this.draft.clone();
                        this.begin_comment(body);
                        cx.notify();
                    }))
                    .child(chip("Edit", cx, |this, _| this.begin_edit()))
                    .child(chip("Transition", cx, |this, cx| {
                        if let Some(key) = this.issue.as_ref().map(|issue| issue.key.clone()) {
                            let id = this.draft.clone();
                            this.pending = Some(Pending::Transition {
                                key,
                                name: id.clone(),
                                id,
                            });
                            cx.notify();
                        }
                    }))
                    .child(chip("Assign to me", cx, |this, cx| {
                        if let Some(key) = this.issue.as_ref().map(|issue| issue.key.clone()) {
                            this.pending = Some(Pending::Assign { key });
                            cx.notify();
                        }
                    }))
                    .child(chip("Add to chat", cx, |this, cx| {
                        let Some(issue) = this.issue.clone() else {
                            return;
                        };
                        let link = jira::format_issue(&this.site, &issue.key).unwrap_or_default();
                        cx.emit(Event::AddToChat {
                            text: jira::issue_markdown(&issue, false, &link),
                        });
                    }))
                    .when(!self.project.is_empty(), |row| {
                        row.child(chip("Start session", cx, |this, cx| {
                            this.handoff(false, cx)
                        }))
                        .child(chip(
                            "Create Board card",
                            cx,
                            |this, cx| this.handoff(true, cx),
                        ))
                    })
                    .child(chip(
                        if self.newest {
                            "Oldest first"
                        } else {
                            "Newest first"
                        },
                        cx,
                        |this, cx| {
                            this.newest = !this.newest;
                            cx.notify();
                        },
                    )),
            )
            .when_some(prompt, |pane, prompt| {
                pane.child(prompt)
                    .child(chip("Confirm", cx, |this, cx| this.confirm(cx)))
                    .child(chip("Cancel", cx, |this, cx| {
                        this.cancel();
                        cx.notify();
                    }))
            })
            .into_any_element()
    }
}

fn chip(
    label: &'static str,
    cx: &mut Context<JiraReader>,
    action: impl Fn(&mut JiraReader, &mut Context<JiraReader>) + 'static,
) -> impl IntoElement {
    div()
        .id(label)
        .px_2()
        .text_size(px(12.))
        .child(label)
        .on_click(cx.listener(move |this, _, _, cx| action(this, cx)))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[gpui::test]
    fn cancel_sends_nothing_and_description_confirm_names_the_replacement(
        cx: &mut gpui::TestAppContext,
    ) {
        cx.update(|cx| {
            let reader = cx.new(|_| JiraReader::new(PathBuf::from("/tmp/jira-reader")));
            reader.update(cx, |reader, cx| {
                reader.issue = Some(Issue {
                    key: "TB-1".into(),
                    summary: "Ship".into(),
                    description: "Body".into(),
                    ..Issue::default()
                });
                reader.begin_edit();
                let prompt = reader.pending_prompt().unwrap();
                assert!(prompt.contains("TB-1"));
                assert!(prompt.contains(super::super::actions::DESCRIPTION_WARNING));
                reader.cancel();
                assert!(reader.pending.is_none());
                assert_eq!(reader.writes, 0);
                reader.finish_write(Ok(()), cx);
                assert!(reader.loading);
                assert_eq!(reader.writes, 1);
            });
        });
    }
}
