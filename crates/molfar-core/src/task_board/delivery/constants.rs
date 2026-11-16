pub const PR: &str = "pr";
pub const MERGE: &str = "merge";
pub const KEEP: &str = "keep";

pub(super) const MAX_BODY: usize = 60_000;
pub(super) const MAX_TITLE: usize = 120;

pub const INTERRUPTED: &str =
    "Delivery was interrupted. Deliver again to finish it; finished steps are skipped.";
