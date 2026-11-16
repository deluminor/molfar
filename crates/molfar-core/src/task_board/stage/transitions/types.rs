#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum BoardAction {
    Start,
    StageSucceeded,
    StageContinued,
    AutoRework,
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
    AwaitCi,
    CiPassed,
    CiFailed,
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
            Self::StageContinued => "stageContinued",
            Self::AutoRework => "autoRework",
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
            Self::AwaitCi => "awaitCi",
            Self::CiPassed => "ciPassed",
            Self::CiFailed => "ciFailed",
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

/// A column the card can move to now; `needs_input` moves open the owner panel
/// for that action instead of running it.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Move {
    pub column: String,
    pub action: BoardAction,
    pub needs_input: bool,
}
