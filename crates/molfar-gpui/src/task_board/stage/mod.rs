mod actions;
mod artifact;
pub(super) mod back;
pub(super) mod delivery;
#[cfg(test)]
mod delivery_tests;
mod moves;
#[cfg(test)]
mod tests;
mod view;

use crate::notes::preview::Preview;
use gpui::{Entity, FocusHandle};

pub(super) struct Artifact {
    title: String,
    pub(super) focus: FocusHandle,
    pub(super) preview: Option<Entity<Preview>>,
    text: Option<String>,
    pub(super) error: Option<String>,
}
