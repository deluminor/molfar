//! The Home Inbox widget's view of the queue, ported from inbox-pulse.ts.
use super::Inbox;

#[derive(Clone, Debug, PartialEq, Eq)]
pub(crate) struct PulseRow {
    pub key: String,
    pub title: String,
    pub provider: String,
    pub unseen: bool,
}

#[derive(Clone, Debug, Default, PartialEq, Eq)]
pub(crate) struct Pulse {
    pub rows: Vec<PulseRow>,
    pub unseen: usize,
    pub loading: bool,
    pub error: Option<String>,
}

impl Inbox {
    pub(crate) fn open_item(&mut self, key: String, cx: &mut gpui::Context<Self>) {
        if self.snapshot.items.iter().any(|item| item.key() == key) {
            self.select(key, cx);
        }
    }

    /// Newest items first, with what the owner has not opened yet.
    pub(crate) fn pulse(&self, limit: usize) -> Pulse {
        let mut items: Vec<_> = self.snapshot.items.iter().collect();
        items.sort_by(|a, b| b.updated_at.cmp(&a.updated_at));
        Pulse {
            rows: items
                .into_iter()
                .take(limit)
                .map(|item| PulseRow {
                    key: item.key(),
                    title: item.title.clone(),
                    provider: item.provider.clone(),
                    unseen: self.state.seen.unseen(item),
                })
                .collect(),
            unseen: self.unread_count(),
            loading: self.loading && self.snapshot.items.is_empty(),
            error: self.error.clone(),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::super::Inbox;
    use gpui::{AppContext, TestAppContext};
    use molfar_core::inbox::Item;
    use std::{
        path::PathBuf,
        sync::{Arc, Mutex},
    };

    fn item(number: i64, updated_at: &str) -> Item {
        Item {
            provider: "github".into(),
            kind: "pr".into(),
            id: number.to_string(),
            number,
            title: format!("PR {number}"),
            updated_at: updated_at.into(),
            ..Default::default()
        }
    }

    #[gpui::test]
    fn pulse_is_newest_first_capped_and_counts_unseen(cx: &mut TestAppContext) {
        let inbox = cx.new(|cx| {
            let store = Arc::new(Mutex::new(
                molfar_core::store::Store::open(std::path::Path::new(":memory:")).unwrap(),
            ));
            let mut inbox = Inbox::new_inner(store, vec![], PathBuf::from("/tmp/pulse"), false, cx);
            inbox.snapshot.items = vec![
                item(1, "2026-11-01T10:00:00Z"),
                item(2, "2026-11-03T10:00:00Z"),
                item(3, "2026-11-02T10:00:00Z"),
            ];
            inbox
        });

        let pulse = inbox.read_with(cx, |inbox, _| inbox.pulse(2));

        assert_eq!(
            pulse
                .rows
                .iter()
                .map(|row| row.title.as_str())
                .collect::<Vec<_>>(),
            ["PR 2", "PR 3"]
        );
        assert_eq!(
            pulse.unseen,
            inbox.read_with(cx, |inbox, _| inbox.unread_count())
        );
        assert!(!pulse.loading);
    }
}
