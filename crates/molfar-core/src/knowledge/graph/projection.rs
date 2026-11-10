use super::super::links::{note_index, resolve_vault_link, LinkResolution};
use super::super::types::VaultNote;
use std::collections::{HashMap, HashSet};

pub const MAX_GRAPH_NODES: usize = 1_500;
const MAX_GRAPH_EDGES: usize = 12_000;

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct GraphNode {
    pub path: String,
    pub title: String,
    /// The top-level folder, which colours the node; empty for root notes.
    pub group: String,
    pub degree: usize,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct GraphEdge {
    pub source: usize,
    pub target: usize,
}

#[derive(Clone, Debug, Default, PartialEq, Eq)]
pub struct GraphProjection {
    pub nodes: Vec<GraphNode>,
    pub edges: Vec<GraphEdge>,
    /// Notes matching the view before the node cap.
    pub total: usize,
    /// Resolved links across the whole vault.
    pub links: usize,
    pub orphans: usize,
    pub missing: usize,
    pub ambiguous: usize,
}

impl GraphProjection {
    pub fn index_of(&self, path: &str) -> Option<usize> {
        self.nodes.iter().position(|node| node.path == path)
    }

    pub fn neighbors(&self, index: usize) -> HashSet<usize> {
        self.edges
            .iter()
            .filter_map(|edge| match (edge.source == index, edge.target == index) {
                (true, _) => Some(edge.target),
                (_, true) => Some(edge.source),
                _ => None,
            })
            .collect()
    }
}

struct Links {
    pairs: Vec<(String, String)>,
    degree: HashMap<String, usize>,
    missing: usize,
    ambiguous: usize,
}

fn resolve_links(notes: &[VaultNote]) -> Links {
    let index = note_index(notes);
    let mut seen = HashSet::new();
    let mut links = Links {
        pairs: Vec::new(),
        degree: HashMap::new(),
        missing: 0,
        ambiguous: 0,
    };

    for note in notes {
        for link in &note.links {
            let target = match resolve_vault_link(&index, &note.path, link) {
                LinkResolution::Resolved { path } if path != note.path => path,
                LinkResolution::Missing => {
                    links.missing += 1;
                    continue;
                }
                LinkResolution::Ambiguous => {
                    links.ambiguous += 1;
                    continue;
                }
                _ => continue,
            };
            let undirected = if note.path < target {
                (note.path.clone(), target.clone())
            } else {
                (target.clone(), note.path.clone())
            };
            if !seen.insert(undirected) {
                continue;
            }
            *links.degree.entry(note.path.clone()).or_default() += 1;
            *links.degree.entry(target.clone()).or_default() += 1;
            links.pairs.push((note.path.clone(), target));
        }
    }

    links
}

fn matches(note: &VaultNote, needle: &str) -> bool {
    needle.is_empty()
        || [&note.path, &note.title]
            .into_iter()
            .chain(&note.aliases)
            .chain(&note.tags)
            .any(|text| text.to_lowercase().contains(needle))
}

fn group_of(path: &str) -> String {
    path.split_once('/')
        .map(|(top, _)| top.to_string())
        .unwrap_or_default()
}

pub fn project_graph(
    notes: &[VaultNote],
    selected: Option<&str>,
    query: &str,
    neighbors_only: bool,
) -> GraphProjection {
    let links = resolve_links(notes);
    let mut neighborhood: HashSet<&str> = selected.into_iter().collect();
    for (source, target) in &links.pairs {
        if Some(source.as_str()) == selected {
            neighborhood.insert(target);
        }
        if Some(target.as_str()) == selected {
            neighborhood.insert(source);
        }
    }

    let needle = query.trim().to_lowercase();
    let degree = |path: &str| links.degree.get(path).copied().unwrap_or(0);
    let mut candidates: Vec<&VaultNote> = notes
        .iter()
        .filter(|note| {
            !neighbors_only || selected.is_none() || neighborhood.contains(note.path.as_str())
        })
        .filter(|note| matches(note, &needle))
        .collect();
    candidates.sort_by(|left, right| {
        let rank = |note: &VaultNote| {
            (
                Some(note.path.as_str()) != selected,
                !neighborhood.contains(note.path.as_str()),
                usize::MAX - degree(&note.path),
            )
        };
        rank(left)
            .cmp(&rank(right))
            .then_with(|| left.path.cmp(&right.path))
    });

    let total = candidates.len();
    let nodes: Vec<GraphNode> = candidates
        .into_iter()
        .take(MAX_GRAPH_NODES)
        .map(|note| GraphNode {
            path: note.path.clone(),
            title: note.title.clone(),
            group: group_of(&note.path),
            degree: degree(&note.path),
        })
        .collect();
    let positions: HashMap<&str, usize> = nodes
        .iter()
        .enumerate()
        .map(|(index, node)| (node.path.as_str(), index))
        .collect();
    let edges = links
        .pairs
        .iter()
        .filter_map(|(source, target)| {
            Some(GraphEdge {
                source: *positions.get(source.as_str())?,
                target: *positions.get(target.as_str())?,
            })
        })
        .take(MAX_GRAPH_EDGES)
        .collect();

    GraphProjection {
        nodes,
        edges,
        total,
        links: links.pairs.len(),
        orphans: notes.iter().filter(|note| degree(&note.path) == 0).count(),
        missing: links.missing,
        ambiguous: links.ambiguous,
    }
}
