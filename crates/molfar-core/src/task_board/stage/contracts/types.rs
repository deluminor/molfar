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
