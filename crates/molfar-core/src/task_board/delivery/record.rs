use super::{
    constants::{KEEP, MERGE, PR},
    types::{Delivery, DeliveryMethod},
};
use serde_json::Value;

impl DeliveryMethod {
    pub fn parse(id: &str) -> Option<Self> {
        match id {
            PR => Some(Self::Pr),
            MERGE => Some(Self::Merge),
            KEEP => Some(Self::Keep),
            _ => None,
        }
    }
}

/// Unknown or malformed records read as none so a desktop-written card never blocks delivery.
pub fn parse(json: Option<&str>) -> Option<Delivery> {
    let value: Value = serde_json::from_str(json?).ok()?;
    let raw = value.as_object()?;
    let method = DeliveryMethod::parse(raw.get("method")?.as_str()?)?;
    let delivered_at = raw
        .get("deliveredAt")
        .and_then(|value| value.as_i64().or_else(|| value.as_f64().map(|v| v as i64)))
        .unwrap_or(0);

    Some(Delivery {
        method,
        delivered_at,
        pr_url: raw.get("prUrl").and_then(Value::as_str).map(str::to_owned),
        merged: raw.get("merged") == Some(&Value::Bool(true)),
    })
}

pub fn to_json(delivery: &Delivery) -> Result<String, String> {
    serde_json::to_string(delivery).map_err(|error| error.to_string())
}

pub fn to_artifact(delivery: &Delivery) -> Result<String, String> {
    serde_json::to_string_pretty(delivery).map_err(|error| error.to_string())
}
