use serde_json::{json, Value};

pub fn list(
    field: &str,
    items: impl IntoIterator<Item = Value>,
    limit: Option<usize>,
    offset: Option<usize>,
) -> Result<Value, String> {
    let limit = limit.unwrap_or(30);
    if !(1..=100).contains(&limit) {
        return Err("List limit must be between 1 and 100.".into());
    }
    let offset = offset.unwrap_or_default();
    let mut items = items.into_iter().skip(offset);
    let page: Vec<_> = items.by_ref().take(limit).collect();
    let next = items.next().map(|_| offset + page.len());
    Ok(json!({field: page, "nextOffset": next}))
}

pub fn text(
    body: &str,
    limit: Option<usize>,
    offset: Option<usize>,
) -> Result<(String, Option<usize>), String> {
    let limit = limit.unwrap_or(6000);
    if !(1..=6000).contains(&limit) {
        return Err("Text limit must be between 1 and 6000.".into());
    }
    let offset = offset.unwrap_or_default();
    let total = body.chars().count();
    if offset > total {
        return Err("Character offset exceeds content length.".into());
    }
    let page = body.chars().skip(offset).take(limit).collect();
    let next = (offset + limit < total).then_some(offset + limit);
    Ok((page, next))
}
