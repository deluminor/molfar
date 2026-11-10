//! Folder colours: the largest top-level folders take the clearest hues, so
//! the legend and the graph agree and colours stay stable across scans.
use gpui::{Hsla, hsla};
use molfar_core::knowledge::GraphProjection;
use std::collections::HashMap;

const HUES: [f32; 10] = [0.58, 0.76, 0.92, 0.08, 0.14, 0.38, 0.48, 0.66, 0.0, 0.22];

#[derive(Clone, Debug, Default)]
pub(super) struct Palette {
    /// Groups by node count, largest first, with their hue slot.
    pub ranked: Vec<(String, usize)>,
    slots: HashMap<String, usize>,
}

impl Palette {
    pub(super) fn new(projection: &GraphProjection) -> Self {
        let mut counts: HashMap<&str, usize> = HashMap::new();
        for node in &projection.nodes {
            *counts.entry(node.group.as_str()).or_default() += 1;
        }
        let mut ranked: Vec<(String, usize)> = counts
            .into_iter()
            .map(|(group, count)| (group.to_string(), count))
            .collect();
        ranked.sort_by(|left, right| right.1.cmp(&left.1).then_with(|| left.0.cmp(&right.0)));
        let slots = ranked
            .iter()
            .filter(|(group, _)| !group.is_empty())
            .enumerate()
            .map(|(slot, (group, _))| (group.clone(), slot))
            .collect();
        Self { ranked, slots }
    }

    /// Root notes stay neutral; folders past the tenth share hues.
    pub(super) fn color(&self, group: &str, light: bool) -> Hsla {
        let Some(slot) = self.slots.get(group) else {
            return if light {
                hsla(0., 0., 0.35, 1.)
            } else {
                hsla(0., 0., 0.82, 1.)
            };
        };
        let hue = HUES[slot % HUES.len()];
        if light {
            hsla(hue, 0.62, 0.46, 1.)
        } else {
            hsla(hue, 0.72, 0.66, 1.)
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use molfar_core::knowledge::GraphNode;

    fn node(group: &str) -> GraphNode {
        GraphNode {
            path: format!("{group}/{}", uuid::Uuid::new_v4()),
            title: String::new(),
            group: group.into(),
            degree: 0,
        }
    }

    #[test]
    fn the_largest_folder_takes_the_first_hue_and_root_notes_stay_neutral() {
        let projection = GraphProjection {
            nodes: vec![node("Small"), node("Big"), node("Big"), node("")],
            ..Default::default()
        };
        let palette = Palette::new(&projection);
        assert_eq!(palette.ranked[0], ("Big".to_string(), 2));
        assert_eq!(palette.color("Big", false).h, HUES[0]);
        assert_eq!(palette.color("Small", false).h, HUES[1]);
        assert_eq!(palette.color("", false).s, 0.);
    }
}
