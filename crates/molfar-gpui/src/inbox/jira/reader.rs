use std::{collections::HashSet, path::PathBuf};

use gpui::{
    Context, Entity, EventEmitter, IntoElement, Render, SharedString, Window, div, prelude::*, px,
};
use molfar_core::{
    atlassian::{self, Client},
    jira::{self, Issue},
};

use crate::{
    input::Input,
    knowledge::{self, PreviewHost},
    theme::content,
};

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
    writes: u32,
    writing: bool,
    offline: bool,
    transitions: Vec<(String, String)>,
    comment_input: Entity<Input>,
    summary_input: Entity<Input>,
    description_input: Entity<Input>,
    labels_input: Entity<Input>,
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
}

impl JiraReader {
    pub(crate) fn new(app: PathBuf, cx: &mut Context<Self>) -> Self {
        let field = |id, placeholder, cx: &mut Context<Self>| {
            cx.new(|cx| Input::field(id, placeholder, content(0.45), cx))
        };
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
            writes: 0,
            writing: false,
            offline: false,
            transitions: Vec::new(),
            comment_input: field("jira-comment", "Comment", cx),
            summary_input: field("jira-summary", "Summary", cx),
            description_input: field("jira-description", "Description", cx),
            labels_input: field("jira-labels", "Labels", cx),
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
                        this.offline = false;
                        this.site = site;
                        this.account_id = account;
                        this.fill_fields(&issue, cx);
                        this.issue = Some(issue);
                    }
                    Err(error) => {
                        this.offline = matches!(error, atlassian::Error::Offline(_));
                        this.error = Some(error.to_string());
                    }
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

    fn load_transitions(&mut self, cx: &mut Context<Self>) {
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
                if let Ok(items) = result {
                    this.transitions = items.into_iter().map(|item| (item.id, item.name)).collect();
                    cx.notify();
                }
            });
        })
        .detach();
    }

    fn insert_issue(&mut self, comments: bool, cx: &mut Context<Self>) {
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

    fn insert_epic(&mut self, issue: &Issue, cx: &mut Context<Self>) {
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

    fn fill_fields(&mut self, issue: &Issue, cx: &mut Context<Self>) {
        let summary = issue.summary.clone();
        let description = issue.description.clone();
        let labels = issue.labels.join(", ");
        self.summary_input
            .update(cx, |input, cx| input.set_text(summary, cx));
        self.description_input
            .update(cx, |input, cx| input.set_text(description, cx));
        self.labels_input
            .update(cx, |input, cx| input.set_text(labels, cx));
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
                let _ = jira::forget_lists(&self.app, &self.site);
                if let Some(key) = self.issue.as_ref().map(|issue| issue.key.clone()) {
                    self.open(key, cx);
                }
            }
            Err(error) => self.error = Some(error.to_string()),
        }
    }

    fn confirm(&mut self, cx: &mut Context<Self>) {
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

fn fetch(app: &std::path::Path, key: &str) -> Result<(String, Issue, String), atlassian::Error> {
    let credentials = atlassian::load(app)?
        .ok_or_else(|| atlassian::Error::Invalid("Connect Atlassian in Settings".into()))?;
    let client = Client::new(&credentials);
    let sprint = jira::sprint_field(&client).ok().flatten();
    let issue = jira::issue::load(&client, key, sprint.as_deref())?;
    let account = jira::issue::account_id(&client).unwrap_or_default();
    let site_full = jira::site_media_full(app, credentials.site()).unwrap_or(true);
    if !site_full {
        for attachment in &issue.attachments {
            if let Ok(Some(bytes)) =
                client.bytes(&format!("/rest/api/3/attachment/content/{}", attachment.id))
            {
                let _ = jira::store_media(app, credentials.site(), &attachment.id, &bytes);
            }
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
        } => jira::issue::edit(
            &client,
            key,
            Some(summary),
            description.as_deref(),
            Some(labels),
        ),
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
        let mut comment_view = Vec::new();
        if comments.is_empty() {
            comment_view.push(div().child("No comments").into_any_element());
        } else {
            for comment in &comments {
                comment_view.push(
                    div()
                        .child(format!("{} {}", comment.author, comment.created))
                        .into_any_element(),
                );
                comment_view.extend(knowledge::render_markdown(
                    self,
                    &comment.body,
                    Some(&media),
                    cx,
                ));
            }
        }
        let browse = format!("{}/browse/{}", self.site.trim_end_matches('/'), issue.key);
        let transitions = self.transitions.clone();
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
            .children(issue.attachments.iter().map(|item| {
                let path = media.join(&item.id);
                let label = format!("{} {}", item.name, item.size);
                div()
                    .id(SharedString::from(format!("jira-file-{}", item.id)))
                    .child(label)
                    .on_click(cx.listener(move |_, _, _, cx| {
                        if path.is_file() {
                            cx.open_url(&format!("file://{}", path.display()));
                        }
                    }))
            }))
            .child(format!(
                "Time spent {}  Original {}  Remaining {}",
                issue.work.spent, issue.work.original, issue.work.remaining
            ))
            .when(issue.work.more > 0, |pane| {
                pane.child(format!("{} more entries", issue.work.more))
            })
            .children(comment_view)
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
                    .child(chip("Copy project link", cx, {
                        let site = self.site.clone();
                        let project = issue.key.split('-').next().unwrap_or("").to_string();
                        move |this, cx| match jira::format_project(&site, &project) {
                            Ok(link) => {
                                cx.write_to_clipboard(gpui::ClipboardItem::new_string(link))
                            }
                            Err(error) => {
                                this.error = Some(error.to_string());
                                cx.notify();
                            }
                        }
                    }))
                    .child(self.comment_input.clone())
                    .child(chip("Comment", cx, |this, cx| {
                        let body = this.comment_input.read(cx).content.to_string();
                        if body.trim().is_empty() {
                            this.error = Some("Comment is empty".into());
                        } else {
                            this.begin_comment(body);
                        }
                        cx.notify();
                    }))
                    .child(self.summary_input.clone())
                    .child(self.description_input.clone())
                    .child(self.labels_input.clone())
                    .child(chip("Edit", cx, |this, cx| {
                        this.begin_edit(cx);
                        cx.notify();
                    }))
                    .child(chip("Transitions", cx, |this, cx| {
                        this.load_transitions(cx)
                    }))
                    .children(transitions.into_iter().map(|(id, name)| {
                        let transition_id = id.clone();
                        let transition_name = name.clone();
                        div()
                            .id(SharedString::from(format!("jira-transition-{id}")))
                            .px_2()
                            .text_size(px(12.))
                            .child(name)
                            .on_click(cx.listener(move |this, _, _, cx| {
                                if let Some(key) =
                                    this.issue.as_ref().map(|issue| issue.key.clone())
                                {
                                    this.pending = Some(Pending::Transition {
                                        key,
                                        id: transition_id.clone(),
                                        name: transition_name.clone(),
                                    });
                                    cx.notify();
                                }
                            }))
                    }))
                    .child(chip("Assign to me", cx, |this, cx| {
                        if let Some(key) = this.issue.as_ref().map(|issue| issue.key.clone()) {
                            this.pending = Some(Pending::Assign { key });
                            cx.notify();
                        }
                    }))
                    .child(chip("Add to chat", cx, |this, cx| {
                        this.insert_issue(false, cx)
                    }))
                    .child(chip("Add comments", cx, |this, cx| {
                        this.insert_issue(true, cx)
                    }))
                    .child(chip("Add epic children", cx, |this, cx| {
                        let Some(issue) = this.issue.clone() else {
                            return;
                        };
                        this.insert_epic(&issue, cx);
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
            let reader = cx.new(|cx| JiraReader::new(PathBuf::from("/tmp/jira-reader"), cx));
            reader.update(cx, |reader, cx| {
                reader.issue = Some(Issue {
                    key: "TB-1".into(),
                    summary: "Ship".into(),
                    description: "Body".into(),
                    ..Issue::default()
                });
                let issue = reader.issue.clone().unwrap();
                reader.fill_fields(&issue, cx);
                reader.begin_edit(cx);
                assert!(
                    !reader
                        .pending_prompt()
                        .unwrap()
                        .contains(super::super::actions::DESCRIPTION_WARNING)
                );
                reader
                    .description_input
                    .update(cx, |input, cx| input.set_text("Replacement".into(), cx));
                reader.begin_edit(cx);
                let prompt = reader.pending_prompt().unwrap();
                assert!(prompt.contains("TB-1"));
                assert!(prompt.contains(super::super::actions::DESCRIPTION_WARNING));
                reader.offline = true;
                reader.insert_issue(false, cx);
                assert_eq!(reader.error.as_deref(), Some("offline: Jira is offline"));
                reader.offline = false;
                reader.begin_comment("Ship it".into());
                reader.confirm(cx);
                assert!(reader.pending.is_none());
                assert!(reader.writing);
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
