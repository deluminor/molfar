mod actions;
mod artifact;
pub(super) mod back;
pub(super) mod delivery;
#[cfg(test)]
mod delivery_tests;
mod footer;
#[cfg(test)]
mod footer_tests;
mod moves;
mod reject;
#[cfg(test)]
mod tests;

use crate::notes::preview::Preview;
use gpui::{Entity, FocusHandle};

pub(super) struct Section {
    pub(super) heading: &'static str,
    pub(super) preview: Entity<Preview>,
}

/// One group version opened inline in the card detail.
pub(super) struct Artifact {
    pub(super) focus: FocusHandle,
    pub(super) sections: Option<Vec<Section>>,
    pub(super) error: Option<String>,
}
