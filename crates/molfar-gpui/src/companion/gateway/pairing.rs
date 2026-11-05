use super::*;

pub(in crate::companion) fn touch_seen(host: &Host, token: &str) -> Option<String> {
    let digest = sha256_hex(token);
    let mut inner = host.inner.lock().ok()?;
    let now = now_ms();
    let device = inner
        .stored
        .devices
        .iter_mut()
        .find(|device| digest_eq(&device.token_sha256, &digest))?;
    device.last_seen_at = Some(now);
    let id = device.id.clone();
    if now.saturating_sub(inner.seen_persisted_at) > SEEN_PERSIST_MS {
        inner.seen_persisted_at = now;
        let _ = write_store(&inner.path, &inner.stored);
    }
    Some(id)
}

pub(in crate::companion) fn pair(host: &Host, body: &Value) -> http::Reply {
    let code = normalize_code(body.get("code").and_then(Value::as_str).unwrap_or(""));
    let name: String = body
        .get("name")
        .and_then(Value::as_str)
        .unwrap_or("Phone")
        .chars()
        .filter(|c| !c.is_control())
        .take(DEVICE_NAME_MAX)
        .collect();
    let Ok(mut inner) = host.inner.lock() else {
        return http::Reply::error(500, "Companion unavailable");
    };
    let now = now_ms();
    let Some(pairing) = inner.pairing.as_mut() else {
        return http::Reply::error(403, "No pairing is open. Show a new code in MOLFAR.");
    };
    if pairing.expires_at < now {
        inner.pairing = None;
        return http::Reply::error(403, "This code has expired. Show a new code in MOLFAR.");
    }
    if !digest_eq(&sha256_hex(&pairing.code), &sha256_hex(&code)) {
        pairing.attempts += 1;
        if pairing.attempts >= PAIR_ATTEMPTS {
            inner.pairing = None;
            return http::Reply::error(403, "Too many wrong codes. Show a new code in MOLFAR.");
        }
        return http::Reply::error(403, "Wrong pairing code");
    }
    inner.pairing = None;
    if inner.stored.devices.len() >= DEVICES_MAX {
        return http::Reply::error(409, "Too many paired devices. Remove one in MOLFAR first.");
    }
    let token = new_token();
    let device = Device {
        id: uuid::Uuid::new_v4().to_string(),
        name: if name.trim().is_empty() {
            "Phone".into()
        } else {
            name.trim().to_string()
        },
        token_sha256: sha256_hex(&token),
        created_at: now,
        last_seen_at: Some(now),
    };
    let device_id = device.id.clone();
    inner.stored.devices.push(device);
    if let Err(error) = write_store(&inner.path, &inner.stored) {
        inner.stored.devices.retain(|device| device.id != device_id);
        return http::Reply::error(500, &error);
    }
    let name = machine_name();
    http::Reply::ok(json!({
        "ok": true,
        "deviceId": device_id,
        "token": token,
        "protocol": PROTOCOL_VERSION,
        "name": name,
    }))
}
