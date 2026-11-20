use secrecy::ExposeSecret;

use super::{
    registry::Redactor,
    token_match::{self, Prefix},
    MIN_VALUE_BYTES,
};

impl Redactor {
    pub fn text(&self, text: &str) -> String {
        self.replace(text, false, None).0
    }

    pub fn scrub(&self, text: &mut String) {
        *text = self.text(text);
    }

    pub fn json(&self, value: &mut serde_json::Value) {
        match value {
            serde_json::Value::String(text) => self.scrub(text),
            serde_json::Value::Array(items) => items.iter_mut().for_each(|item| self.json(item)),
            serde_json::Value::Object(object) => {
                for (mut key, mut value) in std::mem::take(object) {
                    self.scrub(&mut key);
                    self.json(&mut value);
                    object.insert(key, value);
                }
            }
            _ => {}
        }
    }

    fn replace(&self, text: &str, streaming: bool, mut previous: Option<char>) -> (String, usize) {
        let registry = self
            .registry
            .read()
            .unwrap_or_else(|error| error.into_inner());
        let mut patterns = Vec::new();
        for registered in registry
            .get(&self.database)
            .into_iter()
            .flatten()
            .map(|(_, value)| value)
        {
            let entry = &registered.entry;
            if !self.scopes.contains(&entry.scope) {
                continue;
            }
            for value in &registered.values {
                append_patterns(&mut patterns, entry.name.as_str(), value.0.expose_secret());
            }
        }
        for (name, value) in &self.extra {
            append_patterns(&mut patterns, name.as_str(), value.0.expose_secret());
        }
        let ephemeral = self.ephemeral.values();
        for (name, value) in ephemeral.iter() {
            let value = value.0.expose_secret();
            if value.len() < MIN_VALUE_BYTES {
                patterns.push((value, name.as_str(), true));
            } else {
                append_patterns(&mut patterns, name.as_str(), value);
            }
        }
        if patterns.is_empty() {
            return (text.to_owned(), text.len());
        }
        patterns.sort_unstable_by(|a, b| b.0.len().cmp(&a.0.len()).then_with(|| a.1.cmp(b.1)));

        let mut result = String::with_capacity(text.len());
        let mut offset = 0;
        while offset < text.len() {
            let remaining = &text[offset..];
            let matched = patterns.iter().find_map(|(pattern, name, whole)| {
                let prefix = if *whole {
                    token_match::prefix(remaining, pattern, previous, streaming)
                } else if remaining.starts_with(pattern) {
                    Prefix::Complete
                } else if streaming && pattern.starts_with(remaining) {
                    Prefix::Pending
                } else {
                    Prefix::None
                };
                match prefix {
                    Prefix::None => None,
                    other => Some((pattern, name, other)),
                }
            });
            match matched {
                Some((_, _, Prefix::Pending)) => break,
                Some((pattern, name, _)) => {
                    result.push_str("[secret:");
                    result.push_str(name);
                    result.push(']');
                    previous = pattern.chars().next_back();
                    offset += pattern.len();
                }
                None => {
                    let ch = remaining.chars().next().expect("nonempty input");
                    result.push(ch);
                    previous = Some(ch);
                    offset += ch.len_utf8();
                }
            }
        }
        (result, offset)
    }
}

fn append_patterns<'a>(
    patterns: &mut Vec<(&'a str, &'a str, bool)>,
    name: &'a str,
    secret: &'a str,
) {
    patterns.extend(
        std::iter::once(secret)
            .chain(secret.lines())
            .filter(|pattern| pattern.len() >= MIN_VALUE_BYTES)
            .map(|pattern| (pattern, name, false)),
    );
}

#[derive(Default)]
pub struct StreamRedactor {
    tail: String,
    previous: Option<char>,
}

impl StreamRedactor {
    pub fn push(&mut self, redactor: &Redactor, text: &str) -> String {
        self.tail.push_str(text);
        let (result, consumed) = redactor.replace(&self.tail, true, self.previous);
        self.previous = self.tail[..consumed].chars().next_back().or(self.previous);
        secrecy::zeroize::Zeroize::zeroize(&mut self.tail[..consumed]);
        self.tail.drain(..consumed);
        result
    }

    pub fn finish(&mut self, redactor: &Redactor) -> String {
        let result = redactor.replace(&self.tail, false, self.previous).0;
        self.previous = None;
        secrecy::zeroize::Zeroize::zeroize(&mut self.tail);
        result
    }
}

impl Drop for StreamRedactor {
    fn drop(&mut self) {
        secrecy::zeroize::Zeroize::zeroize(&mut self.tail);
    }
}
