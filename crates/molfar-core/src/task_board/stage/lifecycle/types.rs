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
    Retry(Option<StageModelOverride>),
    Cancel,
    Back,
}

#[derive(Clone, Debug)]
pub struct ActionEffect {
    pub card: Card,
    pub stop_session_id: Option<String>,
}

#[derive(Clone, Debug)]
pub struct GrillContext {
    pub card: Card,
    pub run: StageRun,
}

#[derive(Clone, Debug)]
pub struct ReservedGrillSession {
    pub session: Session,
}

#[derive(Clone, Debug)]
pub struct VerifiedGrillOutput {
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
