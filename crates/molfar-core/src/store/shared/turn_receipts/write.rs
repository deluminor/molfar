use super::constants::{RECEIPT_ID, SERVICE_TIER, USAGE_SLICES};
use crate::{
    agent::TurnInfo,
    store::{
        shared::{blocks, sql, HistoryRevision, START_SLACK_MS},
        Store,
    },
    transcript::Row,
};
use serde_json::json;
use std::collections::HashMap;

pub(in crate::store::shared) fn save(
    store: &Store,
    id: i64,
    turns: &HashMap<usize, TurnInfo>,
    strict: bool,
) -> Result<(), String> {
    if turns.is_empty() {
        return Ok(());
    }
    store.shared_writable()?;
    let tx = sql(store.conn.unchecked_transaction())?;
    let mut blocks = store.shared_blocks(id)?;
    if store
        .shared
        .as_ref()
        .unwrap()
        .snapshots
        .borrow()
        .get(&id)
        .is_some_and(|revision| !revision.matches(&blocks))
    {
        return Err("This conversation changed in another window. Reopen it before saving; its data was preserved.".into());
    }
    let (session_provider, session_model): (String, String) = sql(store.conn.query_row(
        "SELECT harness,model FROM sessions WHERE id=?1",
        [store.persisted_session_id(id)?],
        |row| Ok((row.get(0)?, row.get(1)?)),
    ))?;
    let prompt_ids = super::completion::prompt_keys(&blocks)?;
    let mut matched = 0;
    let mut offset = 0;
    let mut changed = false;
    for block in &mut blocks {
        let rows = blocks::project(std::slice::from_ref(block))?;
        let turn = rows
            .iter()
            .rposition(Row::is_prompt)
            .map(|prompt| offset + prompt + 1);
        offset += rows.len();
        let Some(info) = turn.and_then(|turn| turns.get(&turn)) else {
            continue;
        };
        matched += 1;
        let mut fields = Vec::new();
        if strict || super::completion::read(block)?.is_some() {
            changed |= super::completion::merge(block, info.completion.as_ref())?;
        }
        if let Some(root) = info.joined_turn.filter(|_| strict) {
            let root_id = prompt_ids
                .iter()
                .find_map(|(id, key)| (*key == root).then_some(id))
                .ok_or_else(|| "Joined turn root was not found.".to_owned())?;
            if prompt_ids.iter().filter(|(id, _)| id == root_id).count() != 1 {
                return Err("Joined root identity is ambiguous.".into());
            }
            if turn == Some(root) {
                return Err("A turn cannot join itself.".into());
            }
            changed |= super::completion::join(block, root_id)?;
        }

        if !info.provider.is_empty() && (!info.model.is_empty() || info.model_id.is_some()) {
            let mut model = json!({"harness":info.provider});
            if !info.model.is_empty() {
                model["name"] = json!(info.model);
            }
            if let Some(id) = &info.model_id {
                model["id"] = json!(if info.provider == session_provider
                    && crate::store::desktop_import::native_model(&session_model, &session_provider)
                        .as_ref()
                        == Some(id)
                {
                    session_model.clone()
                } else if id.starts_with(&format!("{}:", info.provider)) {
                    id.clone()
                } else {
                    format!("{}:{id}", info.provider)
                });
            }
            fields.push(("turnModel", model));
        }
        if info.has_duration() {
            fields.push(("durationMs", json!(info.duration_ms)));
        }
        if let Some(id) = &info.provider_turn_id {
            fields.push(("providerTurnId", json!(id)));
        }
        if let Some(id) = &info.receipt_id {
            fields.push((RECEIPT_ID, json!(id)));
        }
        if !info.usage_slices.is_empty() {
            fields.push((USAGE_SLICES, json!(info.usage_slices)));
        }
        if let Some(tier) = &info.service_tier {
            fields.push((SERVICE_TIER, json!(tier)));
        }
        if let Some(at) = info.started_at {
            // A native root prompt is written with its send time before
            // its turn receipt arrives; the desktop schema calls it startedAt.
            if block["id"]
                .as_str()
                .is_some_and(|id| id.starts_with("gpui-"))
                && block["startedAt"].is_null()
                && block["sentAt"]
                    .as_u64()
                    .is_none_or(|sent| at.saturating_add(START_SLACK_MS) >= sent)
            {
                block["startedAt"] = json!(at);
                if block["sentAt"].as_u64() == Some(at) {
                    block.as_object_mut().unwrap().remove("sentAt");
                }
                changed = true;
            }
        }
        if let Some(metrics) = info.metrics.filter(|metrics| metrics.reported()) {
            fields.push(("turnMetrics", json!({"inputTokens":metrics.input_tokens,
                    "outputTokens":metrics.output_tokens,"cacheReadTokens":metrics.cache_read_tokens,
                    "cacheWriteTokens":metrics.cache_write_tokens,"cacheHitPercent":metrics.cache_hit_percent})));
        }
        for (key, value) in fields {
            if block[key].is_null() {
                block[key] = value;
                changed = true;
            } else if key == "turnModel" {
                if let (Some(saved), Some(incoming)) =
                    (block[key].as_object_mut(), value.as_object())
                {
                    for (name, value) in incoming {
                        if !saved.contains_key(name) {
                            saved.insert(name.clone(), value.clone());
                            changed = true;
                        }
                    }
                }
            }
        }
    }
    if strict && matched != turns.len() {
        return Err("Turn receipt does not match an existing prompt.".into());
    }
    if changed {
        store.shared_store_blocks(id, &blocks)?;
    }
    sql(tx.commit())?;
    if changed {
        store
            .shared
            .as_ref()
            .unwrap()
            .snapshots
            .borrow_mut()
            .insert(id, HistoryRevision::of(&blocks));
    }
    Ok(())
}
