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

    pub fn parse(column: &str) -> Option<Self> {
        Self::ALL.into_iter().find(|stage| stage.id() == column)
    }
}
