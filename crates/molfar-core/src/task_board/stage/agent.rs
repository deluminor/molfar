use crate::task_board::constants::{CODE_REVIEW, GRILL, IMPLEMENT, REWORK};

#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash)]
pub enum AgentStage {
    Grill,
    Implement,
    CodeReview,
    Rework,
}

impl AgentStage {
    pub const ALL: [Self; 4] = [Self::Grill, Self::Implement, Self::CodeReview, Self::Rework];

    pub fn id(self) -> &'static str {
        match self {
            Self::Grill => GRILL,
            Self::Implement => IMPLEMENT,
            Self::CodeReview => CODE_REVIEW,
            Self::Rework => REWORK,
        }
    }

    pub fn is_read_only(self) -> bool {
        matches!(self, Self::Grill | Self::CodeReview)
    }

    pub fn label(self) -> &'static str {
        match self {
            Self::Grill => "Grill (analysis and planning)",
            Self::Implement => "Implement",
            Self::CodeReview => "Code review",
            Self::Rework => "Rework",
        }
    }

    pub fn parse(column: &str) -> Option<Self> {
        Self::ALL.into_iter().find(|stage| stage.id() == column)
    }
}
