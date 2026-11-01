mod actions;
mod artifact;
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
