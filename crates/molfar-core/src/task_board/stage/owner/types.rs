use crate::task_board::types::Card;

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Question {
    pub number: i64,
    pub title: String,
    pub body: String,
    pub recommended: String,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Answer {
    pub number: i64,
    pub answer: String,
}

#[derive(Clone, Debug)]
pub struct Review {
    pub card: Card,
    pub questions: Vec<Question>,
    pub plan: String,
}
