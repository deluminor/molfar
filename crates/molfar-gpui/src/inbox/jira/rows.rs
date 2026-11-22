//! The Jira list as flat, virtualizable entries: optional group headers,
//! issues, and sub-tasks indented directly under a parent on the page.
use std::collections::{HashMap, HashSet};

use gpui::Hsla;
use molfar_core::jira::{GroupBy, Row, groups};

use super::style::{Tone, priority_glyph, type_glyph};
use crate::inbox::ui::relative_time_at;

/// What one issue row draws, resolved once from the API row.
#[derive(Clone, Debug, PartialEq)]
pub(crate) struct RowView {
    pub key: String,
    pub summary: String,
    pub type_icon: (&'static str, Hsla),
    pub status: String,
    pub tone: Tone,
    pub priority: Option<(&'static str, Hsla)>,
    pub priority_name: String,
    pub assignee: String,
    pub avatar: String,
    pub sprint: String,
    pub updated: String,
}

impl RowView {
    pub(crate) fn new(row: &Row, now_ms: i64) -> Self {
        Self {
            key: row.key.clone(),
            summary: if row.summary.trim().is_empty() {
                "Untitled issue".into()
            } else {
                row.summary.split_whitespace().collect::<Vec<_>>().join(" ")
            },
            type_icon: type_glyph(&row.type_name),
            status: row.status.clone(),
            tone: Tone::of(&row.status_category, &row.status),
            priority: priority_glyph(&row.priority),
            priority_name: row.priority.clone(),
            assignee: row.assignee.clone(),
            avatar: row.assignee_avatar.clone(),
            sprint: row.sprint.clone(),
            updated: relative_time_at(&row.updated, now_ms),
        }
    }
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub(crate) enum Entry {
    Group { title: String, count: usize },
    Issue { index: usize, depth: usize },
    More,
}

pub(crate) fn entries(rows: &[Row], grouping: Option<GroupBy>, more: bool) -> Vec<Entry> {
    let mut out = Vec::new();
    match grouping {
        None => nest(rows, (0..rows.len()).collect(), &mut out),
        Some(by) => {
            for group in groups(rows, by) {
                out.push(Entry::Group {
                    title: group.title,
                    count: group.indexes.len(),
                });
                nest(rows, group.indexes, &mut out);
            }
        }
    }

    if more {
        out.push(Entry::More);
    }
    out
}

fn nest(rows: &[Row], indexes: Vec<usize>, out: &mut Vec<Entry>) {
    let keys: HashSet<&str> = indexes
        .iter()
        .map(|index| rows[*index].key.as_str())
        .collect();
    let mut children: HashMap<&str, Vec<usize>> = HashMap::new();
    let mut tops = Vec::new();
    for index in indexes {
        let parent = rows[index].parent_key.as_str();
        if !parent.is_empty() && parent != rows[index].key && keys.contains(parent) {
            children.entry(parent).or_default().push(index);
        } else {
            tops.push(index);
        }
    }

    for index in tops {
        out.push(Entry::Issue { index, depth: 0 });
        if let Some(subtasks) = children.remove(rows[index].key.as_str()) {
            out.extend(
                subtasks
                    .into_iter()
                    .map(|index| Entry::Issue { index, depth: 1 }),
            );
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn row(key: &str, parent: &str, status: &str) -> Row {
        Row {
            key: key.into(),
            parent_key: parent.into(),
            status: status.into(),
            ..Row::default()
        }
    }

    #[test]
    fn row_view_flattens_summary_and_formats_jira_time_relatively() {
        let now = molfar_core::inbox::timestamp_ms("2026-11-22T15:39:20.882+0200");
        let view = RowView::new(
            &Row {
                key: "TB-1".into(),
                summary: "Ship\n  the   thing".into(),
                type_name: "Bug".into(),
                status: "In Progress".into(),
                priority: "High".into(),
                updated: "2026-11-22T14:39:20.882+0200".into(),
                ..Row::default()
            },
            now,
        );
        assert_eq!(view.summary, "Ship the thing");
        assert_eq!(view.updated, "1 hour ago");
        assert_eq!(view.tone, Tone::Progress);
        assert_eq!(view.type_icon.0, "bug");
        assert_eq!(view.priority.unwrap().0, "chevron-up");
        assert_eq!(RowView::new(&Row::default(), now).summary, "Untitled issue");
        assert_eq!(RowView::new(&Row::default(), now).updated, "");
    }

    #[test]
    fn relative_time_covers_minutes_days_and_raw_jira_offsets() {
        let now = molfar_core::inbox::timestamp_ms("2026-11-22T12:00:00Z");
        assert_eq!(
            relative_time_at("2026-11-22T11:55:00Z", now),
            "5 minutes ago"
        );
        assert_eq!(relative_time_at("2026-11-21T12:00:00Z", now), "yesterday");
        assert_eq!(
            relative_time_at("2026-11-19T14:00:00.000+0200", now),
            "3 days ago"
        );
        assert_eq!(relative_time_at("2026-11-22T12:00:00Z", now), "now");
    }

    #[test]
    fn sub_tasks_follow_their_parent_one_level_in() {
        let rows = [
            row("TB-2", "TB-1", "Open"),
            row("TB-1", "", "Open"),
            row("TB-9", "XX-1", "Open"),
        ];
        assert_eq!(
            entries(&rows, None, true),
            [
                Entry::Issue { index: 1, depth: 0 },
                Entry::Issue { index: 0, depth: 1 },
                Entry::Issue { index: 2, depth: 0 },
                Entry::More,
            ]
        );
    }

    #[test]
    fn grouping_adds_counted_headers_and_nests_only_inside_a_group() {
        let rows = [
            row("TB-1", "", "Open"),
            row("TB-2", "TB-1", "Done"),
            row("TB-3", "TB-1", "Open"),
        ];
        assert_eq!(
            entries(&rows, Some(GroupBy::Status), false),
            [
                Entry::Group {
                    title: "Open".into(),
                    count: 2
                },
                Entry::Issue { index: 0, depth: 0 },
                Entry::Issue { index: 2, depth: 1 },
                Entry::Group {
                    title: "Done".into(),
                    count: 1
                },
                Entry::Issue { index: 1, depth: 0 },
            ]
        );
    }
}
