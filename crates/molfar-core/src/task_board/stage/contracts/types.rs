#[derive(Clone, Debug, PartialEq, Eq)]
pub struct ParsedArtifact {
    pub kind: String,
    pub body: String,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct ManifestReference {
    pub kind: String,
    pub version: i64,
    pub path: String,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct HandoffInput {
    pub kind: String,
    pub version: i64,
    pub body: String,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum ReviewVerdict {
    Approve,
    ChangesRequested,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum FindingSeverity {
    Blocking,
    Major,
    Minor,
    Nit,
}

impl FindingSeverity {
    pub fn id(self) -> &'static str {
        match self {
            Self::Blocking => "blocking",
            Self::Major => "major",
            Self::Minor => "minor",
            Self::Nit => "nit",
        }
    }

    pub fn selected_by_default(self) -> bool {
        matches!(self, Self::Blocking | Self::Major)
    }
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct ReviewFinding {
    pub id: String,
    pub severity: FindingSeverity,
    pub title: String,
    pub file: Option<String>,
    pub body: String,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct CodeReview {
    pub verdict: ReviewVerdict,
    pub findings: Vec<ReviewFinding>,
}

/// Engine facts a stage prompt states beyond the handoff files.
#[derive(Clone, Debug, Default, PartialEq, Eq)]
pub struct PromptExtras {
    /// Unfinished runs of this stage before this one; zero for a fresh start.
    pub continuation: i64,
    /// What the project's verify command did in this checkout, when it ran.
    pub checks: Option<String>,
    /// The commit an earlier successful review covered, so this review reads only what changed.
    pub reviewed_head: Option<String>,
    /// The run continues its section's earlier session instead of starting a new one.
    pub resumed: bool,
}
