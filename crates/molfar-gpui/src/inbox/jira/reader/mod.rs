//! The Jira issue reader: Knowledge-style body with confirmed write actions.
mod body;
mod load;
mod panels;
mod sections;
mod share;
mod toolbar;
mod view;
mod write;

use std::{collections::HashSet, path::PathBuf};

use gpui::{AppContext, Context, Entity, EventEmitter, ListAlignment, ListState, px};
use molfar_core::{
    atlassian::{self},
    jira::{Issue, issue::Comment},
};

use self::load::{Loaded, load};
use super::actions::Pending;
use crate::{
    input::Input,
    knowledge::{PreviewBlock, PreviewHost, PreviewItems},
    popover::AnchorSlot,
    theme::content,
};

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
enum Panel {
    Comment,
    Edit,
    Transition,
}

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
    media: PathBuf,
    description: PreviewItems,
    comments: Vec<(Comment, Vec<PreviewBlock>)>,
    panel: Option<Panel>,
    more_open: bool,
    more_anchor: AnchorSlot,
    body: ListState,
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
            comment_input: cx.new(|cx| Input::multiline_field("Comment", "Write a comment…", cx)),
            summary_input: field("jira-summary", "Summary", cx),
            description_input: cx
                .new(|cx| Input::multiline_field("Description", "Markdown description", cx)),
            labels_input: field("jira-labels", "Labels, comma separated", cx),
            media: PathBuf::new(),
            description: PreviewItems::default(),
            comments: Vec::new(),
            panel: None,
            more_open: false,
            more_anchor: AnchorSlot::default(),
            body: ListState::new(0, ListAlignment::Top, px(400.)),
        }
    }

    pub(crate) fn set_project(&mut self, project: String) {
        self.project = project;
    }

    pub(crate) fn open(&mut self, key: String, cx: &mut Context<Self>) {
        self.loading = true;
        self.error = None;
        self.pending = None;
        let app = self.app.clone();
        cx.spawn(async move |this, cx| {
            let loaded = cx
                .background_executor()
                .spawn(async move { load(&app, &key) })
                .await;
            let _ = this.update(cx, |this, cx| {
                this.loading = false;
                match loaded {
                    Ok(loaded) => this.show(loaded, cx),
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

    #[cfg(test)]
    pub(crate) fn show_issue(&mut self, issue: Issue, cx: &mut Context<Self>) {
        let media = std::env::temp_dir();
        let description = crate::knowledge::parse_preview(&issue.description, None);
        let comments = issue
            .comments
            .iter()
            .map(|comment| {
                (
                    comment.clone(),
                    crate::knowledge::parse_preview(&comment.body, None),
                )
            })
            .collect();
        self.show(
            Loaded {
                site: "https://example.atlassian.net".into(),
                issue,
                account: String::new(),
                media,
                description,
                comments,
            },
            cx,
        );
    }

    fn show(&mut self, loaded: Loaded, cx: &mut Context<Self>) {
        let switched = self.issue.as_ref().map(|issue| &issue.key) != Some(&loaded.issue.key);
        self.offline = false;
        self.site = loaded.site;
        self.account_id = loaded.account;
        self.media = loaded.media;
        self.description = PreviewItems::new(loaded.description);
        self.comments = loaded.comments;
        self.fill_fields(&loaded.issue, cx);
        self.issue = Some(loaded.issue);
        if switched {
            self.panel = None;
            self.transitions.clear();
            self.callouts.clear();
        }
        self.sync_body(switched);
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
}

#[cfg(test)]
mod tests;
