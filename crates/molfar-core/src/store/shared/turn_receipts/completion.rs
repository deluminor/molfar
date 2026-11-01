use super::constants::{COMPLETION, JOINED_PROMPT};
use crate::{agent::turn::TurnCompletion, store::shared::blocks, transcript::Row};
use serde_json::Value;

pub(in crate::store::shared) fn read(block: &Value) -> Result<Option<TurnCompletion>, String> {
    block
        .get(COMPLETION)
        .filter(|value| !value.is_null())
        .map(|value| {
            serde_json::from_value(value.clone())
                .map_err(|error| format!("Invalid terminal turn provenance: {error}"))
        })
        .transpose()
}

pub(in crate::store::shared) fn merge(
    block: &mut Value,
    incoming: Option<&TurnCompletion>,
) -> Result<bool, String> {
    let previous = read(block)?;
    let Some(incoming) = incoming else {
        return Ok(false);
    };
    if let Some(previous) = previous {
        if &previous != incoming {
            return Err("Turn completion is immutable.".into());
        }
        return Ok(false);
    }
    block[COMPLETION] = serde_json::to_value(incoming).map_err(|error| error.to_string())?;
    Ok(true)
}

pub(in crate::store::shared) fn prompt_keys(
    blocks: &[Value],
) -> Result<Vec<(String, usize)>, String> {
    let mut offset = 0;
    let mut keys = Vec::new();
    for block in blocks {
        let rows = blocks::project(std::slice::from_ref(block))?;
        if let (Some(prompt), Some(id)) =
            (rows.iter().rposition(Row::is_prompt), block["id"].as_str())
        {
            keys.push((id.into(), offset + prompt + 1));
        }
        offset += rows.len();
    }
    Ok(keys)
}

pub(in crate::store::shared) fn joined_turn(
    block: &Value,
    keys: &[(String, usize)],
) -> Result<Option<usize>, String> {
    let Some(value) = block.get(JOINED_PROMPT).filter(|value| !value.is_null()) else {
        return Ok(None);
    };
    let root = value
        .as_str()
        .filter(|id| !id.is_empty())
        .ok_or_else(|| "Invalid joined turn provenance.".to_owned())?;
    if block["id"] == root {
        return Err("A turn cannot join itself.".into());
    }
    let mut found = keys.iter().filter(|(id, _)| id == root);
    let Some(key) = found.next().map(|(_, key)| *key) else {
        return Ok(None);
    };
    if found.next().is_some() {
        return Err("Joined root identity is ambiguous.".into());
    }
    Ok(Some(key))
}

pub(in crate::store::shared) fn join(block: &mut Value, root: &str) -> Result<bool, String> {
    if let Some(previous) = block.get(JOINED_PROMPT).filter(|value| !value.is_null()) {
        if previous != root {
            return Err("Joined turn provenance is immutable.".into());
        }
        return Ok(false);
    }
    block[JOINED_PROMPT] = Value::String(root.into());
    Ok(true)
}
