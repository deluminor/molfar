use molfar_core::task_board::{
    stage::contracts::constants::{
        ANSWERS, DELIVERY, IMPL_REPORT, PLAN, PR_DESCRIPTION, QUESTIONS, REVIEW, REWORK_BRIEF, SPEC,
    },
    types::ArtifactMeta,
};

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub(in crate::task_board) enum Group {
    Plan,
    Questions,
    Review,
    Delivery,
}

impl Group {
    pub(in crate::task_board) const ALL: [Self; 4] =
        [Self::Plan, Self::Questions, Self::Review, Self::Delivery];

    pub(in crate::task_board) fn id(self) -> &'static str {
        match self {
            Self::Plan => "plan",
            Self::Questions => "questions",
            Self::Review => "review",
            Self::Delivery => "delivery",
        }
    }

    pub(in crate::task_board) fn label(self) -> &'static str {
        match self {
            Self::Plan => "Plan",
            Self::Questions => "Q&A",
            Self::Review => "Review",
            Self::Delivery => "Delivery",
        }
    }

    pub(in crate::task_board) fn parse(id: &str) -> Option<Self> {
        Self::ALL.into_iter().find(|group| group.id() == id)
    }

    /// Member kinds in reading order, each with its section heading.
    pub(in crate::task_board) fn kinds(self) -> &'static [(&'static str, &'static str)] {
        match self {
            Self::Plan => &[(SPEC, "Specification"), (PLAN, "Plan")],
            Self::Questions => &[(QUESTIONS, "Questions"), (ANSWERS, "Your answers")],
            Self::Review => &[
                (IMPL_REPORT, "Implementation report"),
                (REVIEW, "Code review"),
                (REWORK_BRIEF, "Your rework request"),
            ],
            Self::Delivery => &[(PR_DESCRIPTION, "Pull request"), (DELIVERY, "Delivery")],
        }
    }

    pub(in crate::task_board) fn version_label(self, version: i64) -> String {
        match self {
            Self::Questions => format!("Round {version}"),
            Self::Review => format!("Cycle {version}"),
            Self::Plan | Self::Delivery => format!("v{version}"),
        }
    }

    /// Versions of one Grill round or review cycle line up across kinds. Delivery records
    /// are written once while the PR description follows every cycle, so they carry over.
    fn carries_over(self) -> bool {
        self == Self::Delivery
    }
}

fn of_card<'a>(
    artifacts: &'a [ArtifactMeta],
    card_id: &'a str,
) -> impl Iterator<Item = &'a ArtifactMeta> {
    artifacts.iter().filter(move |a| a.card_id == card_id)
}

/// Newest first.
pub(in crate::task_board) fn versions(
    artifacts: &[ArtifactMeta],
    card_id: &str,
    group: Group,
) -> Vec<i64> {
    let mut versions: Vec<i64> = of_card(artifacts, card_id)
        .filter(|a| group.kinds().iter().any(|(kind, _)| *kind == a.kind))
        .map(|a| a.version)
        .collect();
    versions.sort_unstable_by(|a, b| b.cmp(a));
    versions.dedup();
    versions
}

pub(in crate::task_board) fn present(artifacts: &[ArtifactMeta], card_id: &str) -> Vec<Group> {
    Group::ALL
        .into_iter()
        .filter(|group| !versions(artifacts, card_id, *group).is_empty())
        .collect()
}

/// The artifacts shown for `version`, paired with their section heading.
pub(in crate::task_board) fn members(
    artifacts: &[ArtifactMeta],
    card_id: &str,
    group: Group,
    version: i64,
) -> Vec<(&'static str, ArtifactMeta)> {
    group
        .kinds()
        .iter()
        .filter_map(|(kind, heading)| {
            of_card(artifacts, card_id)
                .filter(|a| a.kind == *kind)
                .filter(|a| {
                    if group.carries_over() {
                        a.version <= version
                    } else {
                        a.version == version
                    }
                })
                .max_by_key(|a| a.version)
                .map(|a| (*heading, a.clone()))
        })
        .collect()
}
