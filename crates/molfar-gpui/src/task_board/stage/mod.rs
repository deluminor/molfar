mod actions;
mod artifact;
pub(super) mod delivery;
#[cfg(test)]
mod delivery_tests;
#[cfg(test)]
mod tests;
mod view;

use crate::notes::preview::Preview;
use gpui::{Entity, FocusHandle};

pub(super) struct Artifact {
    title: String,
    pub(super) focus: FocusHandle,
    preview: Option<Entity<Preview>>,
    text: Option<String>,
    error: Option<String>,
}
