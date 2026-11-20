use secrecy::ExposeSecret;

use super::{registry::Redactor, MIN_VALUE_BYTES};

impl Redactor {
    pub fn text(&self, text: &str) -> String {
        self.replace(text, false).0
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

    fn replace(&self, text: &str, streaming: bool) -> (String, usize) {
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
                let secret = value.0.expose_secret();
                patterns.extend(
                    std::iter::once(secret)
                        .chain(secret.lines())
                        .filter(|pattern| pattern.len() >= MIN_VALUE_BYTES)
                        .map(|pattern| (pattern, entry.name.as_str())),
                );
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
            let matched = patterns.iter().find(|(pattern, _)| {
                remaining.starts_with(pattern) || (streaming && pattern.starts_with(remaining))
            });
            if let Some((pattern, name)) = matched {
                if pattern.len() > remaining.len() {
                    break;
                }
                result.push_str("[secret:");
                result.push_str(name);
                result.push(']');
                offset += pattern.len();
            } else if let Some(ch) = remaining.chars().next() {
                result.push(ch);
                offset += ch.len_utf8();
            }
        }
        (result, offset)
    }
}

#[derive(Default)]
pub struct StreamRedactor {
    tail: String,
}

impl StreamRedactor {
    pub fn push(&mut self, redactor: &Redactor, text: &str) -> String {
        self.tail.push_str(text);
        let (result, consumed) = redactor.replace(&self.tail, true);
        secrecy::zeroize::Zeroize::zeroize(&mut self.tail[..consumed]);
        self.tail.drain(..consumed);
        result
    }

    pub fn finish(&mut self, redactor: &Redactor) -> String {
        let result = redactor.text(&self.tail);
        secrecy::zeroize::Zeroize::zeroize(&mut self.tail);
        result
    }
}

impl Drop for StreamRedactor {
    fn drop(&mut self) {
        secrecy::zeroize::Zeroize::zeroize(&mut self.tail);
    }
}
