mod branch;
pub(crate) mod constants;
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

pub fn remotes(root: &std::path::Path) -> Result<Vec<String>, String> {
    branch::remotes(root)
}

pub fn remove_task_branch(root: &std::path::Path, name: &str) -> Result<bool, String> {
    branch::remove_task(root, name)
}

pub fn verify_retained(card: &crate::task_board::types::Card) -> Result<String, String> {
    worktree::retained(card)
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
mod cleanup_tests;
#[cfg(test)]
mod remote_tests;
#[cfg(all(test, unix))]
mod special_file_tests;
