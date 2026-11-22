//! Jira's issue-type, priority and status colours mapped onto MOLFAR tokens.
use gpui::{Hsla, rgb};

use crate::theme::content;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub(crate) enum Tone {
    Todo,
    Progress,
    Done,
}

impl Tone {
    /// Uses the status category when Jira sent one, else guesses from the name.
    pub(crate) fn of(category: &str, status: &str) -> Self {
        match category {
            "done" => return Self::Done,
            "indeterminate" => return Self::Progress,
            "new" => return Self::Todo,
            _ => {}
        }
        let status = status.to_ascii_lowercase();
        if ["done", "closed", "resolved", "complete", "released"]
            .iter()
            .any(|word| status.contains(word))
        {
            Self::Done
        } else if ["progress", "review", "testing", "qa", "doing", "blocked"]
            .iter()
            .any(|word| status.contains(word))
        {
            Self::Progress
        } else {
            Self::Todo
        }
    }

    pub(crate) fn ink(self) -> Hsla {
        match self {
            Self::Todo => content(0.7),
            Self::Progress => rgb(0x60a5fa).into(),
            Self::Done => rgb(0x4ade80).into(),
        }
    }

    pub(crate) fn fill(self) -> Hsla {
        match self {
            Self::Todo => content(0.08),
            Self::Progress => Hsla::from(rgb(0x60a5fa)).opacity(0.14),
            Self::Done => Hsla::from(rgb(0x4ade80)).opacity(0.14),
        }
    }
}

pub(crate) fn type_glyph(type_name: &str) -> (&'static str, Hsla) {
    let name = type_name.to_ascii_lowercase();
    if name.contains("bug") {
        ("bug", rgb(0xf87171).into())
    } else if name.contains("epic") {
        ("zap", rgb(0xa78bfa).into())
    } else if name.contains("sub") {
        ("jira-subtask", rgb(0x60a5fa).into())
    } else if name.contains("story") {
        ("jira-story", rgb(0x4ade80).into())
    } else if name == "project" {
        ("folder", content(0.6))
    } else {
        ("jira-task", rgb(0x60a5fa).into())
    }
}

/// `None` when the issue has no priority, so the row keeps its column empty.
pub(crate) fn priority_glyph(priority: &str) -> Option<(&'static str, Hsla)> {
    let name = priority.to_ascii_lowercase();
    if name.is_empty() {
        return None;
    }
    Some(
        if name.contains("highest") || name.contains("blocker") || name.contains("critical") {
            ("priority-highest", rgb(0xf87171).into())
        } else if name.contains("high") || name.contains("major") {
            ("chevron-up", rgb(0xfb923c).into())
        } else if name.contains("lowest") || name.contains("trivial") {
            ("priority-lowest", rgb(0x60a5fa).into())
        } else if name.contains("low") || name.contains("minor") {
            ("chevron-down", rgb(0x60a5fa).into())
        } else {
            ("minus", rgb(0xfbbf24).into())
        },
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn status_tone_prefers_category_then_name() {
        assert_eq!(Tone::of("done", "Whatever"), Tone::Done);
        assert_eq!(Tone::of("", "In Review"), Tone::Progress);
        assert_eq!(Tone::of("", "Closed"), Tone::Done);
        assert_eq!(Tone::of("", "Backlog"), Tone::Todo);
    }

    #[test]
    fn type_and_priority_glyphs_cover_common_names() {
        assert_eq!(type_glyph("Bug").0, "bug");
        assert_eq!(type_glyph("Sub-task").0, "jira-subtask");
        assert_eq!(type_glyph("Story").0, "jira-story");
        assert_eq!(type_glyph("Task").0, "jira-task");
        assert_eq!(priority_glyph("Highest").unwrap().0, "priority-highest");
        assert_eq!(priority_glyph("Medium").unwrap().0, "minus");
        assert!(priority_glyph("").is_none());
    }
}
