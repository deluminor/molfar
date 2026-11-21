use roxmltree::Node as Xml;

use super::{adf::link, Document, Node};

const MACRO: &str = "http://atlassian.com/content";
const RESOURCE: &str = "http://atlassian.com/resource/identifier";

pub fn parse(body: &str) -> Result<Document, roxmltree::Error> {
    let wrapped = format!(
        "<root xmlns:ac=\"{MACRO}\" xmlns:ri=\"{RESOURCE}\">{}</root>",
        body.replace("&nbsp;", "&#160;")
    );
    let xml = roxmltree::Document::parse(&wrapped)?;
    Ok(Document(children(xml.root_element())))
}

fn children(node: Xml<'_, '_>) -> Vec<Node> {
    node.children().flat_map(convert).collect()
}

fn attr(node: Xml<'_, '_>, namespace: &str, name: &str) -> String {
    node.attribute((namespace, name))
        .unwrap_or_default()
        .to_owned()
}

fn parameter(node: Xml<'_, '_>, name: &str) -> String {
    node.children()
        .find(|child| {
            child.has_tag_name((MACRO, "parameter"))
                && child.attribute((MACRO, "name")) == Some(name)
        })
        .and_then(|child| child.text())
        .unwrap_or_default()
        .to_owned()
}

fn child<'a, 'input>(node: Xml<'a, 'input>, ns: &str, name: &str) -> Option<Xml<'a, 'input>> {
    node.children().find(|child| child.has_tag_name((ns, name)))
}

fn macro_node(node: Xml<'_, '_>) -> Node {
    let name = attr(node, MACRO, "name");
    let body = || {
        child(node, MACRO, "rich-text-body")
            .map(children)
            .unwrap_or_default()
    };
    match name.as_str() {
        "code" | "noformat" => Node::Code(
            parameter(node, "language"),
            child(node, MACRO, "plain-text-body")
                .and_then(|body| body.text())
                .unwrap_or_default()
                .to_owned(),
        ),
        "info" | "note" | "warning" | "tip" | "success" | "error" | "panel" => {
            Node::Panel(name, body())
        }
        "expand" => Node::Expand(parameter(node, "title"), body()),
        "status" => Node::Status(parameter(node, "title"), parameter(node, "colour")),
        "jira" => Node::Jira(parameter(node, "key"), String::new()),
        _ => Node::Placeholder(name),
    }
}

fn resource_link(node: Xml<'_, '_>) -> Node {
    let label = child(node, MACRO, "link-body")
        .or_else(|| child(node, MACRO, "plain-text-link-body"))
        .map(children)
        .unwrap_or_default();
    if let Some(page) = child(node, RESOURCE, "page") {
        let title = attr(page, RESOURCE, "content-title");
        let id = attr(page, RESOURCE, "content-id");
        let label = if label.is_empty() {
            vec![Node::Text(title.clone())]
        } else {
            label
        };
        let url = if id.is_empty() {
            let query: String = url::form_urlencoded::Serializer::new(String::new())
                .append_pair("title", &title)
                .append_pair("spaceKey", &attr(page, RESOURCE, "space-key"))
                .finish();
            format!("/wiki/spaces/viewpage.action?{query}")
        } else {
            format!("/wiki/pages/viewpage.action?pageId={id}")
        };

        return Node::PageLink(url, label);
    }

    if let Some(attachment) = child(node, RESOURCE, "attachment") {
        return link(attr(attachment, RESOURCE, "filename"), label);
    }

    Node::Paragraph(children(node))
}

fn convert(node: Xml<'_, '_>) -> Vec<Node> {
    if node.is_text() {
        let text = node.text().unwrap_or_default();
        if text.trim().is_empty() && text.contains('\n') {
            return Vec::new();
        }

        return vec![Node::Text(text.to_owned())];
    }

    if !node.is_element() {
        return Vec::new();
    }

    let tag = node.tag_name();
    let contents = || children(node);
    let attribute = |name| node.attribute(name).unwrap_or_default().to_owned();
    let block = match (tag.namespace(), tag.name()) {
        (Some(MACRO), "structured-macro" | "macro") => macro_node(node),
        (Some(MACRO), "task-list") => Node::List(false, contents()),
        (Some(MACRO), "task") => Node::Item(
            Some(
                child(node, MACRO, "task-status").and_then(|status| status.text())
                    == Some("complete"),
            ),
            child(node, MACRO, "task-body")
                .map(children)
                .unwrap_or_default(),
        ),
        (Some(MACRO), "link") => resource_link(node),
        (Some(MACRO), "image") => Node::Media(
            child(node, RESOURCE, "attachment")
                .map(|attachment| attr(attachment, RESOURCE, "filename"))
                .or_else(|| child(node, RESOURCE, "url").map(|url| attr(url, RESOURCE, "value")))
                .unwrap_or_default(),
            attr(node, MACRO, "alt"),
        ),
        (Some(MACRO), "emoticon") => {
            let fallback = attr(node, MACRO, "emoji-fallback");
            Node::Emoji(if fallback.is_empty() {
                attr(node, MACRO, "name")
            } else {
                fallback
            })
        }
        (Some(RESOURCE), "user") => {
            let label = attr(node, RESOURCE, "display-name");
            Node::Mention(if label.is_empty() {
                attr(node, RESOURCE, "account-id")
            } else {
                label
            })
        }
        (_, "p") => Node::Paragraph(contents()),
        (_, "h1" | "h2" | "h3" | "h4" | "h5" | "h6") => {
            Node::Heading(tag.name().as_bytes()[1] - b'0', contents())
        }
        (_, "ul" | "ol") => Node::List(tag.name() == "ol", contents()),
        (_, "li") => Node::Item(None, contents()),
        (_, "table") => Node::Table(contents()),
        (_, "tr") => Node::Row(contents()),
        (_, "td" | "th") => Node::Cell(contents()),
        (_, "strong" | "b") => Node::Strong(contents()),
        (_, "em" | "i") => Node::Emphasis(contents()),
        (_, "s" | "del") => Node::Strike(contents()),
        (_, "code") => Node::InlineCode(contents()),
        (_, "pre") => Node::Code(
            String::new(),
            node.descendants()
                .filter(|child| child.is_text())
                .filter_map(|child| child.text())
                .collect(),
        ),
        (_, "blockquote") => Node::Panel(String::new(), contents()),
        (_, "br") => Node::Break,
        (_, "a") => link(attribute("href"), contents()),
        (_, "img") => Node::Media(attribute("src"), attribute("alt")),
        (_, "time") => Node::Date(attribute("datetime")),
        _ => return contents(),
    };

    vec![block]
}
