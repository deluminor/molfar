use crate::familiar::Familiar;
use serde_json::{json, Value};

pub fn profile(familiar: &Familiar) -> Value {
    json!({
        "familiarId":familiar.id,"name":familiar.name,
        "mascot":familiar.mascot,"color":format!("#{:06x}", familiar.color),
    })
}
