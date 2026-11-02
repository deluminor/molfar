mod branch;
mod materialize;
pub mod policy;
mod snapshot;
pub mod types;
mod worktree;

#[cfg(test)]
mod tests;

pub fn ensure_worktree(
    card: &crate::task_board::types::Card,
) -> Result<types::RetainedCheckout, String> {
    worktree::ensure(card)
}

pub fn snapshot(root: &std::path::Path) -> Result<types::CheckoutSnapshot, String> {
    snapshot::capture(root)
}

pub fn materialize(
    root: &std::path::Path,
    inputs: &[crate::task_board::stage::contracts::types::HandoffInput],
) -> Result<Vec<crate::task_board::stage::contracts::types::ManifestReference>, String> {
    materialize::prepare(root, inputs)
}

#[cfg(test)]
mod remote_tests;
#[cfg(all(test, unix))]
mod special_file_tests;
