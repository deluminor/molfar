//! Enrolment and request dispatch for a connected phone.

use super::*;

pub(super) fn session_id(command_id: &str) -> String {
    let digest = Sha256::digest(format!("molfar-mobile/session:{command_id}"));
    let mut bytes = [0; 16];
    bytes.copy_from_slice(&digest[..16]);
    // UUID version 8 reserves the custom data format used here.
    bytes[6] = (bytes[6] & 0x0f) | 0x80;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    uuid::Uuid::from_bytes(bytes).to_string()
}
pub(super) fn enroll(
    host: &MobileHost,
    inner: &mut Inner,
    peer: &str,
    params: &Value,
) -> Result<Value, String> {
    let invitation = inner
        .invitations
        .get(peer)
        .ok_or("Invitation already used or revoked")?;
    if invitation.expires <= now() {
        return Err("Invitation expired".into());
    }
    let certificate = params["certificate"]
        .as_str()
        .ok_or("Missing device identity")?;
    let proof = params["proof"].as_str().ok_or("Missing device proof")?;
    let fingerprint = molfar_mobile_link::verify_proof(certificate, peer, proof)?;
    let name = params["name"]
        .as_str()
        .unwrap_or("Phone")
        .trim()
        .chars()
        .take(80)
        .collect::<String>();
    let id = uuid::Uuid::new_v4().to_string();
    let mut config = inner.config.clone();
    config
        .devices
        .retain(|device| device.fingerprint != fingerprint);
    config.devices.push(Device {
        id: id.clone(),
        name,
        fingerprint: fingerprint.clone(),
    });
    save(host, &config)?;
    inner.config = config;
    inner.invitations.remove(peer);
    host.gate.remove(peer);
    host.gate.allow(fingerprint, None);
    Ok(
        json!({"deviceId":id,"name":crate::mobile_access::name(),"fingerprint":inner.identity.as_ref().unwrap().fingerprint()?,"addresses":addresses(inner)}),
    )
}
pub(super) async fn handle(
    app: &AppHandle,
    host: &MobileHost,
    peer: &str,
    request: Value,
) -> Result<Value, String> {
    if request["version"] != VERSION {
        return Err("Update MOLFAR on both devices".into());
    }
    let method = request["method"].as_str().ok_or("Invalid mobile method")?;
    let mut params = request["params"].clone();
    if !params.is_object() {
        return Err("Invalid mobile parameters".into());
    }
    let receiver = {
        let mut inner = host
            .inner
            .lock()
            .map_err(|_| "Mobile service unavailable")?;
        if !inner.config.enabled {
            return Err("Mobile access disabled".into());
        }
        if method == "device.enroll" {
            return enroll(host, &mut inner, peer, &params);
        }
        let device = inner
            .config
            .devices
            .iter()
            .find(|device| device.fingerprint == peer)
            .ok_or("Device revoked or not paired")?
            .clone();
        if method == "device.leave" {
            let mut config = inner.config.clone();
            config.devices.retain(|v| v.id != device.id);
            save(host, &config)?;
            inner.config = config;
            host.gate.remove(peer);
            inner.watches.retain(|_, watch| watch.peer != peer);
            return Ok(Value::Null);
        }
        if method == "workspace.list" {
            let mut catalog = merged_catalog(app, &mut inner);
            catalog["sessions"] = json!(recent_sessions(&catalog["sessions"]));
            catalog["addresses"] = json!(addresses(&inner));
            return Ok(catalog);
        }
        if method == "sessions.list" {
            let catalog = merged_catalog(app, &mut inner);
            return Ok(session_page(&catalog["sessions"], &params));
        }
        if ![
            "conversation.read",
            "conversation.older",
            "models.list",
            "accounts.usage",
            "session.configure",
            "project.changes",
            "project.worktrees",
            "project.files",
            "project.file",
            "project.search",
            "project.fileHighlight",
            "project.git",
            "project.gitAction",
            "session.start",
            "conversation.send",
            "session.cancel",
            "session.rename",
            "session.delete",
            "session.archive",
        ]
        .contains(&method)
        {
            return Err("Unsupported mobile operation".into());
        }
        if inner.pending.len() >= 16 {
            return Err("Desktop is busy; try again".into());
        }
        let catalog = merged_catalog(app, &mut inner);
        // The model sheet asks about a conversation when it has one, else a
        // project, and goes to the window that owns whichever it named.
        let route = match method {
            "models.list" if params["conversationId"].is_string() => "conversation.read",
            "models.list"
            | "accounts.usage"
            | "project.worktrees"
            | "project.files"
            | "project.file"
            | "project.search"
            | "project.fileHighlight"
            | "project.git"
            | "project.gitAction" => "project.changes",
            _ => method,
        };
        let entity = if route == "session.start" || route == "project.changes" {
            params["projectId"].as_str()
        } else {
            params["conversationId"].as_str()
        }
        .ok_or("Missing workspace item")?;
        let owner = pick_owner(&inner.catalogs, route, entity)
            .ok_or("This workspace item is no longer available")?;
        drop(catalog);
        let id = uuid::Uuid::new_v4().to_string();
        let command_id = request["id"]
            .as_str()
            .filter(|id| !id.is_empty() && id.len() <= 128)
            .ok_or("Missing command ID")?;
        let command_id = format!("{}:{command_id}", device.id);
        if method == "session.start" {
            params["sessionId"] = json!(session_id(&command_id));
        }
        let (send, receive) = oneshot::channel();
        inner.pending.insert(
            id.clone(),
            Pending {
                window: owner.clone(),
                reply: send,
            },
        );
        if app
            .emit_to(
                owner.as_str(),
                "molfar-mobile-request",
                json!({"id":id,"commandId":command_id,"method":method,"params":params}),
            )
            .is_err()
        {
            inner.pending.remove(&id);
            return Err("Desktop window is unavailable".into());
        }
        (id, receive)
    };
    let response = tokio::time::timeout(Duration::from_secs(25), receiver.1).await;
    host.inner.lock().unwrap().pending.remove(&receiver.0);
    let response = response
        .map_err(|_| "Desktop window did not answer")?
        .map_err(|_| "Desktop window closed")?;
    if !host.gate.admits(peer) {
        return Err("Device revoked".into());
    }
    if response["ok"] == true {
        Ok(response["result"].clone())
    } else {
        Err(response["error"]
            .as_str()
            .unwrap_or("Desktop request failed")
            .into())
    }
}

pub(crate) fn router_config(host: &MobileHost) -> bool {
    let inner = host.inner.lock().unwrap();
    inner.config.enabled && inner.config.open_router && inner.endpoint.is_some()
}
pub(crate) fn router_result(host: &MobileHost, address: Option<Address>, status: String) {
    let mut inner = host.inner.lock().unwrap();
    inner.router_address = address;
    inner.router_status = status;
}
pub(crate) fn router_claim(host: &MobileHost) -> bool {
    let mut inner = host.inner.lock().unwrap();
    if inner.router_started {
        false
    } else {
        inner.router_started = true;
        true
    }
}
