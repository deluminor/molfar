use std::{path::PathBuf, sync::Arc};

use molfar_core::confluence::{
    connector::{Node as TreeNode, valid_id},
    document::Node,
    page::Page,
};
use url::Url;

use crate::{
    markdown,
    markdown_model::{Block, InlineRun, InlineStyle, TaskMarker},
};

pub(super) struct DocumentView {
    pub page: Arc<Page>,
    pub children: Vec<TreeNode>,
    pub ancestors: Vec<TreeNode>,
    pub blocks: Vec<ReaderBlock>,
    /// Expand blocks before each top-level block, for stable fold ids when
    /// blocks are laid out one at a time.
    pub callout_starts: Vec<usize>,
    pub headings: Vec<(usize, String)>,
    pub internal_links: Vec<(String, String)>,
}

pub(super) enum ReaderBlock {
    Common(Block),
    Panel(String, Vec<ReaderBlock>),
    Expand(String, Vec<ReaderBlock>),
    Status(String, String),
    Jira(Vec<InlineRun>),
    Placeholder(String),
    Image(Option<PathBuf>, String),
}

impl DocumentView {
    pub fn new(page: Page, children: Vec<TreeNode>, query: &str) -> Self {
        let mut internal_links = Vec::new();
        let blocks: Vec<_> = page
            .document
            .0
            .iter()
            .flat_map(|node| project(node, &page, query, &mut internal_links))
            .collect();
        let headings = blocks
            .iter()
            .enumerate()
            .filter_map(|(index, block)| match block {
                ReaderBlock::Common(Block::Heading { runs, .. }) => {
                    Some((index, runs.iter().map(|run| run.text.as_str()).collect()))
                }
                _ => None,
            })
            .collect();
        let mut seen = 0;
        let callout_starts = blocks
            .iter()
            .map(|block| {
                let start = seen;
                seen += expands(block);
                start
            })
            .collect();
        Self {
            page: Arc::new(page),
            children,
            ancestors: Vec::new(),
            callout_starts,
            blocks,
            headings,
            internal_links,
        }
    }
}

fn expands(block: &ReaderBlock) -> usize {
    match block {
        ReaderBlock::Expand(_, children) => 1 + children.iter().map(expands).sum::<usize>(),
        ReaderBlock::Panel(_, children) => children.iter().map(expands).sum(),
        _ => 0,
    }
}

fn project(
    node: &Node,
    page: &Page,
    query: &str,
    links: &mut Vec<(String, String)>,
) -> Vec<ReaderBlock> {
    let nested = |nodes: &[Node], links: &mut Vec<(String, String)>| {
        nodes
            .iter()
            .flat_map(|node| project(node, page, query, links))
            .collect()
    };
    let common = |node: &Node, links: &mut Vec<(String, String)>| plain(node, page, query, links);
    let block = match node {
        Node::Panel(kind, nodes) => ReaderBlock::Panel(kind.clone(), nested(nodes, links)),
        Node::Expand(title, nodes) => ReaderBlock::Expand(title.clone(), nested(nodes, links)),
        Node::Status(label, color) => ReaderBlock::Status(label.clone(), color.clone()),
        Node::Jira(_, _) => ReaderBlock::Jira(runs(std::slice::from_ref(node), page, query, links)),
        Node::Placeholder(name) => ReaderBlock::Placeholder(name.clone()),
        Node::Media(id, alt) => ReaderBlock::Image(page.images.get(id).cloned(), alt.clone()),
        Node::Paragraph(items)
            if items.iter().any(|node| {
                matches!(
                    node,
                    Node::Status(..) | Node::Jira(..) | Node::Placeholder(..) | Node::Media(..)
                )
            }) =>
        {
            let mut blocks = Vec::new();
            let mut pending = Vec::new();
            for child in items {
                if matches!(
                    child,
                    Node::Status(..) | Node::Jira(..) | Node::Placeholder(..) | Node::Media(..)
                ) {
                    if !pending.is_empty() {
                        blocks.push(ReaderBlock::Common(common(
                            &Node::Paragraph(std::mem::take(&mut pending)),
                            links,
                        )));
                    }
                    blocks.extend(project(child, page, query, links));
                } else {
                    pending.push(child.clone());
                }
            }
            if !pending.is_empty() {
                blocks.push(ReaderBlock::Common(common(
                    &Node::Paragraph(pending),
                    links,
                )));
            }
            return blocks;
        }
        _ => ReaderBlock::Common(common(node, links)),
    };
    vec![block]
}

fn plain(node: &Node, page: &Page, query: &str, links: &mut Vec<(String, String)>) -> Block {
    match node {
        Node::Paragraph(nodes) => Block::Paragraph {
            runs: runs(nodes, page, query, links),
        },
        Node::Heading(level, nodes) => Block::Heading {
            level: *level,
            runs: runs(nodes, page, query, links),
        },
        Node::Code(language, code) => Block::CodeBlock {
            language: Some(language.clone()),
            code: code.clone(),
        },
        Node::List(ordered, items) => Block::List {
            ordered_start: ordered.then_some(1),
            items: items
                .iter()
                .filter_map(|item| {
                    let Node::Item(checked, nodes) = item else {
                        return None;
                    };
                    let mut blocks: Vec<_> = nodes
                        .iter()
                        .map(|node| plain(node, page, query, links))
                        .collect();
                    if let (Some(checked), Some(Block::Paragraph { runs })) =
                        (checked, blocks.first_mut())
                    {
                        let marker = InlineRun {
                            text: String::new(),
                            style: InlineStyle {
                                task: Some(TaskMarker { checked: *checked }),
                                ..Default::default()
                            },
                        };
                        runs.insert(0, marker);
                    }
                    Some(blocks)
                })
                .collect(),
        },
        Node::Table(nodes) => {
            let mut rows: Vec<_> = nodes
                .iter()
                .filter_map(|row| {
                    let Node::Row(cells) = row else { return None };
                    Some(
                        cells
                            .iter()
                            .filter_map(|cell| {
                                let Node::Cell(nodes) = cell else { return None };
                                Some(runs(nodes, page, query, links))
                            })
                            .collect::<Vec<_>>(),
                    )
                })
                .collect();
            let header = if rows.is_empty() {
                Vec::new()
            } else {
                rows.remove(0)
            };
            Block::Table {
                align: vec![crate::markdown_model::TableAlign::Left; header.len()],
                header,
                rows,
            }
        }
        _ => Block::Paragraph {
            runs: runs(std::slice::from_ref(node), page, query, links),
        },
    }
}

fn runs(
    nodes: &[Node],
    page: &Page,
    query: &str,
    links: &mut Vec<(String, String)>,
) -> Vec<InlineRun> {
    let mut runs = Vec::new();
    super::inline::write(nodes, page, &InlineStyle::default(), &mut runs, links);
    markdown::mark_runs(&mut runs, query, false);
    runs
}

pub(super) fn safe_url(page: &Page, raw: &str) -> Option<Url> {
    let url = Url::parse(&page.url).ok()?.join(raw).ok()?;
    (matches!(url.scheme(), "https" | "http" | "mailto")
        && url.username().is_empty()
        && url.password().is_none())
    .then_some(url)
}

pub(super) fn page_id(page: &Page, url: &Url) -> Option<String> {
    if Url::parse(&page.url).ok()?.origin() != url.origin() {
        return None;
    }
    url.query_pairs()
        .find_map(|(key, id)| (key == "pageId" && valid_id(&id)).then(|| id.into_owned()))
        .or_else(|| {
            let (_, rest) = url.path().split_once("/pages/")?;
            let id = rest.split('/').next()?;
            valid_id(id).then(|| id.to_owned())
        })
}
