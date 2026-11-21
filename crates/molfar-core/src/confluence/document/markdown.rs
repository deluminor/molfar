use super::{Document, Node};

pub fn export(document: &Document, page_url: &str) -> String {
    let result = blocks(&document.0, page_url);
    if result.is_empty() {
        "_This page is empty._".to_owned()
    } else {
        result
    }
}

fn blocks(nodes: &[Node], page_url: &str) -> String {
    nodes
        .iter()
        .map(|node| render(node, page_url))
        .filter(|text| !text.trim().is_empty())
        .collect::<Vec<_>>()
        .join("\n\n")
}

fn inlines(nodes: &[Node], page_url: &str) -> String {
    nodes.iter().map(|node| render(node, page_url)).collect()
}

fn escape(value: &str) -> String {
    let mut text = String::new();
    for ch in value.chars() {
        if matches!(ch, '\\' | '`' | '*' | '_' | '[' | ']' | '<' | '>' | '~') {
            text.push('\\');
        }
        text.push(ch);
    }
    text
}

fn destination(value: &str) -> Option<String> {
    if value.starts_with("//") || value.contains('\\') || value.chars().any(char::is_control) {
        return None;
    }

    if let Ok(url) = url::Url::parse(value) {
        if !matches!(url.scheme(), "https" | "http" | "mailto")
            || !url.username().is_empty() && url.scheme() != "mailto"
            || url.password().is_some()
        {
            return None;
        }
    } else if value.contains(':') {
        return None;
    }

    Some(
        value
            .replace(' ', "%20")
            .replace('(', "%28")
            .replace(')', "%29")
            .replace('<', "%3C")
            .replace('>', "%3E"),
    )
}

fn link(label: &str, url: &str) -> String {
    destination(url).map_or_else(|| label.to_owned(), |dest| format!("[{label}]({dest})"))
}

fn fence(text: &str) -> String {
    let count = text
        .split(|ch| ch != '`')
        .map(str::len)
        .max()
        .unwrap_or_default();
    "`".repeat(count + 1)
}

fn render(node: &Node, page_url: &str) -> String {
    let inline = |values: &[Node]| inlines(values, page_url);
    let block = |values: &[Node]| blocks(values, page_url);
    match node {
        Node::Text(text) | Node::Emoji(text) | Node::Date(text) => escape(text),
        Node::Paragraph(values) => inline(values),
        Node::Heading(level, values) => format!(
            "{} {}",
            "#".repeat(usize::from((*level).clamp(1, 6))),
            inline(values)
        ),
        Node::List(ordered, values) => values
            .iter()
            .enumerate()
            .map(|(index, item)| {
                let marker = if *ordered {
                    format!("{}. ", index + 1)
                } else {
                    "- ".to_owned()
                };
                let padding = " ".repeat(marker.len());
                let body = render(item, page_url).replace('\n', &format!("\n{padding}"));
                format!("{marker}{body}")
            })
            .collect::<Vec<_>>()
            .join("\n"),
        Node::Item(checked, values) => {
            let marker = match checked {
                Some(true) => "[x] ",
                Some(false) => "[ ] ",
                None => "",
            };
            format!("{marker}{}", block(values))
        }
        Node::Code(language, text) => {
            let language: String = language
                .chars()
                .filter(|ch| ch.is_ascii_alphanumeric() || matches!(ch, '_' | '-' | '+' | '#'))
                .collect();
            let fence = if fence(text).len() < 3 {
                "```".to_owned()
            } else {
                fence(text)
            };
            format!(
                "{fence}{language}\n{}\n{fence}",
                text.trim_end_matches('\n')
            )
        }
        Node::Table(rows) => table(rows, page_url),
        Node::Row(values) | Node::Cell(values) => block(values),
        Node::Panel(kind, values) => {
            let marker = match kind.as_str() {
                "note" => "> [!NOTE]\n",
                "success" | "tip" => "> [!TIP]\n",
                "warning" => "> [!WARNING]\n",
                "error" => "> [!CAUTION]\n",
                "info" | "panel" => "> [!IMPORTANT]\n",
                _ => "",
            };
            format!(
                "{marker}{}",
                block(values)
                    .lines()
                    .map(|line| format!("> {line}"))
                    .collect::<Vec<_>>()
                    .join("\n")
            )
        }
        Node::Expand(title, values) => format!("### {}\n\n{}", escape(title), block(values)),
        Node::Status(text, _) => format!("**{}**", escape(text)),
        Node::Media(id, alt) => {
            let label = escape(if alt.is_empty() { id } else { alt });
            destination(id).map_or_else(|| label.clone(), |dest| format!("![{label}]({dest})"))
        }
        Node::Link(url, label) | Node::PageLink(url, label) => {
            let label = if label.is_empty() {
                escape(url)
            } else {
                inline(label)
            };
            link(&label, url)
        }
        Node::Mention(label) => format!("@{}", escape(label.trim_start_matches('@'))),
        Node::Jira(key, server) => {
            let server = if server.starts_with("https://") {
                server
            } else {
                page_url
            };
            if let Ok(mut url) = url::Url::parse(server) {
                url.set_path(&format!("/browse/{key}"));
                url.set_query(None);
                url.set_fragment(None);
                link(&escape(key), url.as_str())
            } else {
                escape(key)
            }
        }
        Node::Placeholder(name) => format!(
            "Unsupported Confluence macro: {}. {}",
            escape(name),
            link("Open in Confluence", page_url)
        ),
        Node::Strong(values) => format!("**{}**", inline(values)),
        Node::Emphasis(values) => format!("*{}*", inline(values)),
        Node::Strike(values) => format!("~~{}~~", inline(values)),
        Node::InlineCode(values) => {
            let text = inline(values);
            let fence = fence(&text);
            format!("{fence}{text}{fence}")
        }
        Node::Break => "  \n".to_owned(),
    }
}

fn table(rows: &[Node], page_url: &str) -> String {
    let mut lines = Vec::new();
    for row in rows {
        let Node::Row(cells) = row else { continue };
        let columns = cells
            .iter()
            .map(|cell| {
                render(cell, page_url)
                    .trim()
                    .replace('|', "\\|")
                    .replace('\n', " ")
            })
            .collect::<Vec<_>>();
        lines.push(format!("| {} |", columns.join(" | ")));
        if lines.len() == 1 {
            lines.push(format!(
                "|{} --- |",
                " --- |".repeat(columns.len().saturating_sub(1))
            ));
        }
    }

    lines.join("\n")
}
