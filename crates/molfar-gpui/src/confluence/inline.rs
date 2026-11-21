use molfar_core::confluence::{document::Node, page::Page};

use super::render::{page_id, safe_url};
use crate::markdown_model::{InlineRun, InlineStyle};

pub(super) fn write(
    nodes: &[Node],
    page: &Page,
    style: &InlineStyle,
    out: &mut Vec<InlineRun>,
    links: &mut Vec<(String, String)>,
) {
    for node in nodes {
        let mut style = style.clone();
        let text = match node {
            Node::Text(text) | Node::Emoji(text) | Node::Date(text) | Node::Status(text, _) => {
                text.clone()
            }
            Node::Mention(text) => format!("@{}", text.trim_start_matches('@')),
            Node::Break => "\n".into(),
            Node::Strong(children) => {
                style.bold = true;
                write(children, page, &style, out, links);
                continue;
            }
            Node::Emphasis(children) => {
                style.italic = true;
                write(children, page, &style, out, links);
                continue;
            }
            Node::Strike(children) => {
                style.strikethrough = true;
                write(children, page, &style, out, links);
                continue;
            }
            Node::InlineCode(children) => {
                style.code = true;
                write(children, page, &style, out, links);
                continue;
            }
            Node::Link(raw, children) | Node::PageLink(raw, children) => {
                if let Some(url) = safe_url(page, raw) {
                    if let Some(id) = page_id(page, &url) {
                        style.link = Some(format!("molfar-confluence:{id}"));
                        let mut label = Vec::new();
                        write(
                            children,
                            page,
                            &InlineStyle::default(),
                            &mut label,
                            &mut Vec::new(),
                        );
                        let title: String = label.into_iter().map(|run| run.text).collect();
                        if !links.iter().any(|(known, _)| known == &id) {
                            links.push((id, title));
                        }
                    } else {
                        style.link = Some(url.to_string());
                }
                if !children.is_empty() {
                    write(children, page, &style, out, links);
                    continue;
                }
                raw.clone()
            }
            Node::Jira(key, server) => {
                let domain = if server.starts_with("https://") {
                    server
                } else {
                    &page.url
                };
                if let Ok(mut url) = url::Url::parse(domain)
                    && url.username().is_empty() && url.password().is_none()
                {
                        url.set_path(&format!("/browse/{key}"));
                        url.set_query(None);
                        url.set_fragment(None);
                        style.link = Some(url.to_string());
                }
                key.clone()
            }
            Node::Paragraph(children)
            | Node::Heading(_, children)
            | Node::Item(_, children)
            | Node::Cell(children) => {
                write(children, page, &style, out, links);
                continue;
            }
            Node::Media(_, alt) => alt.clone(),
            _ => continue,
        };
        if !text.is_empty() {
            out.push(InlineRun { text, style });
        }
    }
}
