use serde_json::{json, Value};

pub(super) fn table(lines: &[&str], index: usize) -> (Value, usize) {
    let mut cursor = index;
    let mut rows = Vec::new();
    while cursor < lines.len() && lines[cursor].trim_start().starts_with('|') {
        if !is_separator(lines[cursor]) {
            let cells = cells(lines[cursor])
                .into_iter()
                .map(|cell| {
                    json!({"type":"tableCell","content":[{"type":"paragraph","content":super::scan::inline(&cell)}]})
                })
                .collect::<Vec<_>>();
            rows.push(json!({"type":"tableRow","content":cells}));
        }
        cursor += 1;
    }
    (json!({"type":"table","content":rows}), cursor)
}

fn cells(line: &str) -> Vec<String> {
    line.trim()
        .trim_matches('|')
        .split('|')
        .map(|cell| cell.trim().replace("\\|", "|"))
        .collect()
}

fn is_separator(line: &str) -> bool {
    let cells = cells(line);
    !cells.is_empty()
        && cells.iter().all(|cell| {
            let cell = cell.trim();
            !cell.is_empty() && cell.chars().all(|char| matches!(char, '-' | ':'))
        })
}

pub(super) fn list(lines: &[&str], index: usize) -> (Value, usize) {
    let first = list_item(lines[index].trim()).expect("caller checked");
    let family = Family::of(&first);
    let start = match first {
        Item::Ordered(number, _) => number,
        _ => 1,
    };
    let mut cursor = index;
    let mut items = Vec::new();
    while cursor < lines.len() {
        let Some(item) = list_item(lines[cursor].trim()) else {
            break;
        };
        if Family::of(&item) != family {
            break;
        }
        let (state, text) = match item {
            Item::Task(done, text) => (Some(if done { "DONE" } else { "TODO" }), text),
            Item::Bullet(text) | Item::Ordered(_, text) => (None, text),
        };
        let paragraph = json!({"type":"paragraph","content":super::scan::inline(&text)});
        items.push(match state {
            Some(state) => json!({"type":"taskItem","attrs":{"state":state},"content":[paragraph]}),
            None => json!({"type":"listItem","content":[paragraph]}),
        });
        cursor += 1;
    }
    let node = match family {
        Family::Task => json!({"type":"taskList","content":items}),
        Family::Ordered => json!({"type":"orderedList","attrs":{"order":start},"content":items}),
        Family::Bullet => json!({"type":"bulletList","content":items}),
    };
    (node, cursor)
}

enum Item {
    Bullet(String),
    Ordered(u64, String),
    Task(bool, String),
}

#[derive(Clone, Copy, PartialEq, Eq)]
enum Family {
    Bullet,
    Ordered,
    Task,
}

impl Family {
    fn of(item: &Item) -> Self {
        match item {
            Item::Bullet(_) => Self::Bullet,
            Item::Ordered(_, _) => Self::Ordered,
            Item::Task(_, _) => Self::Task,
        }
    }
}

pub(super) fn is_list(line: &str) -> bool {
    list_item(line).is_some()
}

fn list_item(line: &str) -> Option<Item> {
    if let Some(text) = line.strip_prefix("- [ ] ") {
        return Some(Item::Task(false, text.to_string()));
    }
    if let Some(text) = line
        .strip_prefix("- [x] ")
        .or_else(|| line.strip_prefix("- [X] "))
    {
        return Some(Item::Task(true, text.to_string()));
    }
    if let Some(text) = line.strip_prefix("- ") {
        return Some(Item::Bullet(text.to_string()));
    }
    let (number, text) = line.split_once(". ")?;
    if number.is_empty() || !number.chars().all(|char| char.is_ascii_digit()) {
        return None;
    }
    Some(Item::Ordered(number.parse().ok()?, text.to_string()))
}
