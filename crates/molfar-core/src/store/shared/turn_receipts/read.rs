use super::{
    completion,
    constants::{JOINED_PROMPT, REQUEST},
};
use crate::{app_access::turn::StoredAppTurn, store::Store};
use serde_json::Value;

fn committed_prompt(block: &Value) -> bool {
    block["role"] == "user" && block["draft"] != true
}

pub(in crate::store::shared) fn result(
    store: &Store,
    session: i64,
    request: &str,
) -> Result<Option<StoredAppTurn>, String> {
    let tx = store
        .conn
        .unchecked_transaction()
        .map_err(|error| error.to_string())?;
    let blocks = store.shared_all_blocks(session)?;
    let mut matches = blocks
        .iter()
        .enumerate()
        .filter(|(_, block)| committed_prompt(block) && block[REQUEST] == request);
    let Some((index, root)) = matches.next() else {
        return Ok(None);
    };
    if matches.next().is_some() {
        return Err("App request matches more than one prompt.".into());
    }
    if root
        .get(JOINED_PROMPT)
        .is_some_and(|value| !value.is_null())
    {
        return Err("App request identifies a joined prompt rather than its root.".into());
    }
    let prompt_id = root["id"]
        .as_str()
        .filter(|id| !id.is_empty())
        .ok_or_else(|| "App prompt has no stable identity.".to_owned())?
        .to_owned();
    let keys = completion::prompt_keys(&blocks)?;
    let mut roots = keys.iter().filter(|(id, _)| id == &prompt_id);
    let turn = roots
        .next()
        .map(|(_, key)| *key)
        .ok_or_else(|| "App prompt cannot be projected.".to_owned())?;
    if roots.next().is_some() {
        return Err("App root identity is ambiguous.".into());
    }
    let mut text = String::new();
    for block in &blocks[index + 1..] {
        if block["draft"] == true {
            continue;
        }
        if block["role"] == "user" {
            if let Some(joined) = block.get(JOINED_PROMPT).filter(|value| !value.is_null()) {
                if joined != &prompt_id || completion::joined_turn(block, &keys)? != Some(turn) {
                    return Err("App turn contains inconsistent joined prompt provenance.".into());
                }
                continue;
            }
            if block["startedAt"].is_number() || block[REQUEST].is_string() {
                break;
            }
            return Err("App turn contains an unclassified intermediate prompt.".into());
        }
        if block["role"] != "assistant" {
            continue;
        }
        if let Some(part) = block["text"].as_str().filter(|part| !part.is_empty()) {
            if !text.is_empty() {
                text.push('\n');
            }
            text.push_str(part);
        }
    }
    let result = StoredAppTurn {
        prompt_id,
        turn,
        completion: completion::read(root)?,
        text,
    };
    tx.commit().map_err(|error| error.to_string())?;
    Ok(Some(result))
}
