#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum BoardAction {
    Start,
    StageSucceeded,
    StageFailed,
    Answer,
    RequestChanges,
    ApprovePlan,
    EditPlan,
    EditTask,
    Rework,
    DeliverStart,
    Deliver,
    DeliveryFailed,
    Retry,
    Back,
    Cancel,
    Reject,
}

impl BoardAction {
    pub fn id(self) -> &'static str {
        match self {
            Self::Start => "start",
            Self::StageSucceeded => "stageSucceeded",
            Self::StageFailed => "stageFailed",
            Self::Answer => "answer",
            Self::RequestChanges => "requestChanges",
            Self::ApprovePlan => "approvePlan",
            Self::EditPlan => "editPlan",
            Self::EditTask => "editTask",
            Self::Rework => "rework",
            Self::DeliverStart => "deliverStart",
            Self::Deliver => "deliver",
            Self::DeliveryFailed => "deliveryFailed",
            Self::Retry => "retry",
            Self::Back => "back",
            Self::Cancel => "cancel",
            Self::Reject => "reject",
        }
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum TransitionEffect {
    EnsureWorktree,
    ResetGrillRound,
    NextGrillRound,
    NextReworkCycle,
    StopSession,
    CleanupWorktree,
    ClearError,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct Position<'a> {
    pub column: &'a str,
    pub run_state: &'a str,
    pub archived: bool,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Transition {
    pub column: String,
    pub run_state: &'static str,
    pub archived: bool,
    pub effects: Vec<TransitionEffect>,
}
