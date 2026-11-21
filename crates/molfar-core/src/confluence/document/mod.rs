pub mod adf;
pub mod markdown;
pub mod storage;

use serde::{Deserialize, Serialize};

#[derive(Clone, Debug, Default, PartialEq, Serialize, Deserialize)]
pub struct Document(pub Vec<Node>);

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub enum Node {
    Text(String),
    Paragraph(Vec<Node>),
    Heading(u8, Vec<Node>),
    List(bool, Vec<Node>),
    Item(Option<bool>, Vec<Node>),
    Code(String, String),
    Table(Vec<Node>),
    Row(Vec<Node>),
    Cell(Vec<Node>),
    Panel(String, Vec<Node>),
    Expand(String, Vec<Node>),
    Status(String, String),
    Media(String, String),
    Link(String, Vec<Node>),
    PageLink(String, Vec<Node>),
    Mention(String),
    Jira(String, String),
    Emoji(String),
    Date(String),
    Placeholder(String),
    Strong(Vec<Node>),
    Emphasis(Vec<Node>),
    Strike(Vec<Node>),
    InlineCode(Vec<Node>),
    Break,
}

#[cfg(test)]
mod tests {
    use super::{adf, markdown, storage};

    #[test]
    fn confluence_adf_rich_document_matches_golden() {
        let document = adf::parse(include_str!("fixtures/rich.json")).unwrap();
        assert_eq!(
            markdown::export(&document, "https://example.invalid/page"),
            include_str!("fixtures/rich.md").trim_end()
        );
    }

    #[test]
    fn confluence_storage_rich_document_matches_golden() {
        let document = storage::parse(include_str!("fixtures/rich.xhtml")).unwrap();
        assert_eq!(
            markdown::export(&document, "https://example.invalid/page"),
            include_str!("fixtures/rich.md").trim_end()
        );
    }
}
