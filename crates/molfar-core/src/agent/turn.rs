use serde::{Deserialize, Serialize};

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "status", rename_all = "snake_case")]
pub enum TurnCompletion {
    Succeeded { completed_at: u64 },
    Failed { completed_at: u64, error: String },
    Cancelled { completed_at: u64 },
}
