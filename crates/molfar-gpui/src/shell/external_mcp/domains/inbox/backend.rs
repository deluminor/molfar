use molfar_core::inbox::{Details, Diff, Item, Service, Snapshot, Thread, ViewState};
use std::path::PathBuf;

pub(in crate::shell::external_mcp) trait ExternalInbox:
    Send + Sync
{
    fn list(&self, projects: &[PathBuf], providers: &[&str]) -> Snapshot;
    fn connected(&self, provider: &str) -> Result<bool, String>;
    fn details(&self, item: &Item) -> Result<Details, String>;
    fn thread(&self, item: &Item) -> Result<Thread, String>;
    fn diff(&self, item: &Item) -> Result<Diff, String>;
    fn comment(&self, item: &Item, body: String, reply_to: String) -> Result<(), String>;
}

impl ExternalInbox for Service {
    fn list(&self, projects: &[PathBuf], providers: &[&str]) -> Snapshot {
        self.list_providers(projects, &ViewState::default(), providers)
    }

    fn connected(&self, provider: &str) -> Result<bool, String> {
        self.status(provider).map(|status| status.connected)
    }

    fn details(&self, item: &Item) -> Result<Details, String> {
        self.details(item)
    }

    fn thread(&self, item: &Item) -> Result<Thread, String> {
        self.thread(item)
    }

    fn diff(&self, item: &Item) -> Result<Diff, String> {
        self.diff(item)
    }

    fn comment(&self, item: &Item, body: String, reply_to: String) -> Result<(), String> {
        self.comment(item, body, reply_to).map(drop)
    }
}
