use chrono::{DateTime, Utc};
use serde_json::Value;

use super::{Document, Node};

pub fn parse(body: &str) -> Result<Document, serde_json::Error> {
    let root: Value = serde_json::from_str(body)?;
    Ok(Document(children(&root)))
}

fn children(value: &Value) -> Vec<Node> {
    value["content"]
        .as_array()
        .into_iter()
        .flatten()
        .flat_map(convert)
        .collect()
}

fn string(value: &Value) -> String {
    value.as_str().unwrap_or_default().to_owned()
}

fn convert(value: &Value) -> Vec<Node> {
    let attrs = &value["attrs"];
    let contents = || children(value);
    let node = match value["type"].as_str().unwrap_or_default() {
        "text" => styled_text(value),
        "paragraph" => Node::Paragraph(contents()),
        "heading" => Node::Heading(
            attrs["level"].as_u64().unwrap_or(1).clamp(1, 6) as u8,
            contents(),
        ),
        "bulletList" | "taskList" => Node::List(false, contents()),
        "orderedList" => Node::List(true, contents()),
        "listItem" => Node::Item(None, contents()),
        "taskItem" => Node::Item(Some(attrs["state"] == "DONE"), contents()),
        "codeBlock" => Node::Code(
            string(&attrs["language"]),
            value["content"]
                .as_array()
                .into_iter()
                .flatten()
                .filter_map(|node| node["text"].as_str())
                .collect(),
        ),
        "table" => Node::Table(contents()),
        "tableRow" => Node::Row(contents()),
        "tableCell" | "tableHeader" => Node::Cell(contents()),
        "panel" => Node::Panel(string(&attrs["panelType"]), contents()),
        "blockquote" => Node::Panel(String::new(), contents()),
        "expand" | "nestedExpand" => Node::Expand(string(&attrs["title"]), contents()),
        "status" => Node::Status(string(&attrs["text"]), string(&attrs["color"])),
        "mention" => Node::Mention(
            attrs["text"]
                .as_str()
                .or_else(|| attrs["id"].as_str())
                .unwrap_or("unknown")
                .to_owned(),
        ),
        "emoji" => Node::Emoji(
            attrs["text"]
                .as_str()
                .or_else(|| attrs["shortName"].as_str())
                .unwrap_or_default()
                .to_owned(),
        ),
        "date" => Node::Date(date(attrs)),
        "media" | "mediaInline" => Node::Media(string(&attrs["id"]), string(&attrs["alt"])),
        "inlineCard" | "blockCard" => link(string(&attrs["url"]), Vec::new()),
        "extension" | "bodiedExtension" | "inlineExtension" => extension(attrs),
        "hardBreak" => Node::Break,
        _ => return contents(),
    };

    vec![node]
}

fn date(attrs: &Value) -> String {
    let timestamp = attrs["timestamp"].as_str().unwrap_or_default();
    timestamp
        .parse::<i64>()
        .ok()
        .and_then(DateTime::<Utc>::from_timestamp_millis)
        .map_or_else(
            || timestamp.to_owned(),
            |date| date.date_naive().to_string(),
        )
}

fn extension(attrs: &Value) -> Node {
    let name = attrs["extensionKey"].as_str().unwrap_or("unknown");
    if name == "jira" {
        let parameters = &attrs["parameters"]["macroParams"];
        return Node::Jira(
            string(&parameters["key"]["value"]),
            string(&parameters["server"]["value"]),
        );
    }

    Node::Placeholder(name.to_owned())
}

fn styled_text(value: &Value) -> Node {
    let mut text = Node::Text(string(&value["text"]));
    for mark in value["marks"].as_array().into_iter().flatten() {
        text = match mark["type"].as_str().unwrap_or_default() {
            "strong" => Node::Strong(vec![text]),
            "em" => Node::Emphasis(vec![text]),
            "strike" => Node::Strike(vec![text]),
            "code" => Node::InlineCode(vec![text]),
            "link" => link(string(&mark["attrs"]["href"]), vec![text]),
            _ => text,
        };
    }

    text
}

pub(super) fn link(url: String, label: Vec<Node>) -> Node {
    if url.starts_with("/wiki/pages/viewpage.action?pageId=") || url.contains("/wiki/spaces/") {
        Node::PageLink(url, label)
    } else {
        Node::Link(url, label)
    }
}
