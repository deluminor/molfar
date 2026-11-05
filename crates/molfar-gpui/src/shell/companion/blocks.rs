use serde_json::{Value, json};

pub(super) fn block(mut source: Value) -> Option<Value> {
    if source["draft"] == true
        || (source["internal"] == true && !source["familiarSessionCompletion"].is_object())
    {
        return None;
    }
    if source["role"] == "remote-plan"
        && let Ok(plan) = serde_json::from_str::<Value>(source["text"].as_str().unwrap_or_default())
    {
        source["role"] = json!("plan");
        source["text"] = plan["text"].clone();
        source["streaming"] = plan["streaming"].clone();
    }
    let role = source["role"].as_str()?;
    if !matches!(
        role,
        "user"
            | "assistant"
            | "image"
            | "reasoning"
            | "tool"
            | "approval"
            | "tasks"
            | "plan"
            | "system"
            | "handoff"
    ) {
        return None;
    }
    let text = source["text"].as_str().unwrap_or_default();
    let mut shown: String = text.chars().take(24_000).collect();
    if text.chars().count() > 24_000 {
        shown.push_str("\n…");
    }
    let mut block = json!({"id":source["id"],"role":role,"text":shown});
    for key in ["streaming", "card", "notice"] {
        if let Some(value) = source.get(key) {
            block[key] = value.clone();
        }
    }
    if let Some(card) = source.get("familiarCard") {
        block["card"] = card.clone();
    }
    if let Some(at) = source.get("startedAt").or(source.get("sentAt")) {
        block["at"] = at.clone();
    }
    if let Some(tool) = source.get("tool") {
        let mut detail = json!({});
        for key in ["title", "kind", "status"] {
            if let Some(value) = tool.get(key) {
                detail[key] = value.clone();
            }
        }
        block["tool"] = detail;
    } else if role == "tool"
        && let Ok(tool) = serde_json::from_str::<molfar_core::tool::ToolCall>(text)
    {
        block["text"] = json!(tool.name);
        block["tool"] = json!({"title":tool.name,"status":tool.state});
    }
    if let Some(approval) = source.get("approval") {
        let mut detail = json!({"requestId":approval["requestId"]});
        if let Some(decided) = approval.get("decided") {
            detail["decided"] = decided.clone();
        }
        block["approval"] = detail;
    }
    if let Some(items) = source["attachments"].as_array() {
        block["attachments"]=json!(items.iter().map(|item|json!({"name":item["name"],"kind":item["kind"],"mimeType":item["mimeType"]})).collect::<Vec<_>>());
    }
    if let Some(name) = source.pointer("/familiarHabit/name") {
        block["habit"] = json!({"name":name});
    }
    Some(block)
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn companion_retains_cards_and_normalizes_native_plans() {
        let card = json!({"type":"session","sessionId":"child","title":"Work"});
        let shown =
            block(json!({"id":"card","role":"assistant","text":"","familiarCard":card})).unwrap();
        assert_eq!(shown["card"], card);
        let plan=block(json!({"id":"plan","role":"remote-plan","text":json!({"text":"Plan text","streaming":true}).to_string()})).unwrap();
        assert_eq!(plan["role"], "plan");
        assert_eq!(plan["text"], "Plan text");
        assert_eq!(plan["streaming"], true);
    }

    #[test]
    fn companion_projects_only_visible_bounded_wire_fields() {
        assert!(block(json!({"role":"user","draft":true})).is_none());
        assert!(block(json!({"role":"user","internal":true})).is_none());
        let shown=block(json!({"id":"a","role":"assistant","text":"é".repeat(24_001),"providerState":{"secret":"private"},"attachments":[{"name":"file","kind":"file","mimeType":"text/plain","path":"/private/path","data":"private"}]})).unwrap();
        assert_eq!(shown["text"].as_str().unwrap().chars().count(), 24_002);
        assert!(shown.get("providerState").is_none());
        assert!(shown["attachments"][0].get("path").is_none());
        assert!(shown["attachments"][0].get("data").is_none());
    }
}
