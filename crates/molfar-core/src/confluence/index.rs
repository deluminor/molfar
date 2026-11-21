use super::{
    connector::{Connector, Node},
    http::Transport,
};

const MAX_ENTRIES: usize = 40;
const MAX_EXCERPT: usize = 160;
const MAX_CHARS: usize = 8_000;
const FETCH_HINT: &str = "Fetch on demand with confluence.read";

pub fn excerpt(markdown: &str) -> String {
    let mut text = String::new();
    let mut count = 0;
    for word in markdown.split_whitespace() {
        if count != 0 {
            text.push(' ');
            count += 1;
        }

        for ch in word.chars().take(MAX_EXCERPT.saturating_sub(count)) {
            text.push(ch);
            count += 1;
        }
        if count >= MAX_EXCERPT {
            break;
        }
    }

    text.trim_end().to_owned()
}

impl<T: Transport> Connector<T> {
    pub fn index(&self, nodes: &[Node]) -> String {
        let mut output = String::new();
        let mut remaining = MAX_CHARS - FETCH_HINT.chars().count();
        for node in nodes.iter().take(MAX_ENTRIES) {
            let title = node
                .title
                .replace(['\n', '\r'], " ")
                .replace('[', "\\[")
                .replace(']', "\\]");
            let mut line = format!("- [{title}]({}) ({})", node.url, node.id);
            if let Some(page) = self.cached_page(&node.id) {
                let summary = excerpt(&page.markdown().0);
                line.push_str(" — ");
                line.push_str(&summary);
            }
            line.push('\n');
            let length = line.chars().count();
            if length + 1 > remaining {
                break;
            }

            remaining -= length;
            output.push_str(&line);
        }

        if !output.is_empty() {
            output.push('\n');
        }
        output.push_str(FETCH_HINT);
        output
    }
}
