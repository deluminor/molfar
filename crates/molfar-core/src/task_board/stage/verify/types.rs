/// The result of running a project's verify command in a card's checkout.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct CheckRun {
    pub command: String,
    pub passed: bool,
    pub exit: Option<i32>,
    pub timed_out: bool,
    pub tail: String,
}
