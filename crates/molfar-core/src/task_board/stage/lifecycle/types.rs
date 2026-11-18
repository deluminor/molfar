use crate::{
    store::Session,
    task_board::{
        stage::{
            checkout::types::CheckoutSnapshot, choice::overrides::StageModelOverride,
            contracts::types::ParsedArtifact,
        },
        types::{Card, StageRun},
    },
};

#[derive(Clone, Debug, PartialEq, Eq)]
pub enum StageAction {
    Start,
    ApprovePlan,
    Rework {
        findings: Vec<String>,
        note: String,
        review_version: i64,
    },
    Retry(Option<StageModelOverride>),
    Cancel,
    Back,
    /// Blank answers use the current recommendation; an empty list writes only the note.
    Answer {
        answers: Vec<super::super::owner::types::Answer>,
        note: String,
    },
    RequestChanges(String),
    EditPlan(String),
    EditTask(super::super::owner::types::TaskEdit),
}

impl StageAction {
    pub fn board_action(&self) -> crate::task_board::stage::transitions::types::BoardAction {
        use crate::task_board::stage::transitions::types::BoardAction;

        match self {
            Self::Start => BoardAction::Start,
            Self::ApprovePlan => BoardAction::ApprovePlan,
            Self::Rework { .. } => BoardAction::Rework,
            Self::Retry(_) => BoardAction::Retry,
            Self::Cancel => BoardAction::Cancel,
            Self::Back => BoardAction::Back,
            Self::Answer { .. } => BoardAction::Answer,
            Self::RequestChanges(_) => BoardAction::RequestChanges,
            Self::EditPlan(_) => BoardAction::EditPlan,
            Self::EditTask(_) => BoardAction::EditTask,
        }
    }
}

#[derive(Clone, Debug)]
pub struct ActionEffect {
    pub card: Card,
    pub stop_session_id: Option<String>,
}

#[derive(Clone, Debug)]
pub struct StageContext {
    pub card: Card,
    pub run: StageRun,
}

/// Where a stage run talks to its agent: a new session, or its section's earlier one.
#[derive(Clone, Debug, PartialEq, Eq)]
pub enum SessionPlan {
    Fresh,
    /// `compact` asks for compaction before the run's prompt is sent.
    Reuse {
        session: String,
        compact: bool,
    },
    /// The context filled up on a harness that cannot compact: a new session stands in for
    /// the compaction and counts toward the stage run's compaction cap.
    Reset,
}

#[derive(Clone, Debug)]
pub struct ReservedStageSession {
    pub session: Session,
}

#[derive(Clone, Debug)]
pub struct VerifiedStageOutput {
    pub artifacts: Vec<ParsedArtifact>,
    pub after: CheckoutSnapshot,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum FailureStatus {
    Failed,
    Cancelled,
    Interrupted,
}

impl FailureStatus {
    pub(crate) fn id(self) -> &'static str {
        match self {
            Self::Failed => super::constants::FAILED,
            Self::Cancelled => super::constants::CANCELLED,
            Self::Interrupted => super::constants::INTERRUPTED,
        }
    }
}

/// What the engine itself observed about a finished turn, never what the agent claims.
#[derive(Clone, Copy, Debug, Default, PartialEq)]
pub struct Signals {
    /// Context share of the turn's session; `None` when the harness never reported a window.
    pub context_ratio: Option<f32>,
    /// Compactions MOLFAR triggered in this stage run, this turn included.
    pub compactions: usize,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum NoticeKind {
    Failed,
    Gate,
    Stalled,
}

#[derive(Clone, Debug)]
pub struct StageNotice {
    pub card_id: String,
    pub project_cwd: String,
    pub kind: NoticeKind,
    pub title: String,
    pub body: String,
}

#[derive(Clone, Debug, Default)]
pub struct StageEffect {
    pub changed: bool,
    pub card: Option<Card>,
    pub notice: Option<StageNotice>,
}
