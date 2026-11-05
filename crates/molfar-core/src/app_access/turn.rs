use crate::agent::turn::TurnCompletion;

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct StoredAppTurn {
    pub prompt_id: String,
    /// Whole-history projected key; indexed viewport keys may have a different origin.
    pub turn: usize,
    pub completion: Option<TurnCompletion>,
    pub text: String,
}
