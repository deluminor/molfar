//! Tauri commands the settings page and app windows call.

use super::*;

#[tauri::command]
pub fn mobile_status(host: State<'_, MobileHost>) -> Result<Value, String> {
    let inner = host
        .inner
        .lock()
        .map_err(|_| "Mobile service unavailable")?;
    Ok(
        json!({"enabled":inner.config.enabled,"listening":inner.endpoint.is_some(),"name":name(),"fingerprint":inner.identity.as_ref().and_then(|v| v.fingerprint().ok()),"addresses":addresses(&inner),"devices":inner.config.devices,"remoteAddress":inner.config.remote_address}),
    )
}
#[tauri::command]
pub async fn mobile_configure(
    app: AppHandle,
    host: State<'_, MobileHost>,
    enabled: bool,
    remote_address: String,
) -> Result<(), String> {
    if !remote_address.trim().is_empty() {
        Address::parse(&remote_address)?;
    }
    {
        let mut inner = host
            .inner
            .lock()
            .map_err(|_| "Mobile service unavailable")?;
        let config = Config {
            enabled,
            remote_address: remote_address.trim().into(),
            devices: inner.config.devices.clone(),
        };
        save(&host, &config)?;
        inner.config = config;
        if !enabled {
            if let Some(endpoint) = inner.endpoint.take() {
                endpoint.close(1_u32.into(), b"Mobile access disabled");
            }
            for key in inner.invitations.keys() {
                host.gate.remove(key);
            }
            inner.invitations.clear();
            inner.pending.clear();
            inner.watches.clear();
        }
    }
    if enabled {
        start(&app, &host).await?;
    }
    Ok(())
}
#[tauri::command]
pub fn mobile_invite(host: State<'_, MobileHost>) -> Result<Value, String> {
    let identity = identity(&host)?;
    let mut inner = host
        .inner
        .lock()
        .map_err(|_| "Mobile service unavailable")?;
    if !inner.config.enabled || inner.endpoint.is_none() {
        return Err("Enable mobile access first".into());
    }
    // One visible invitation at a time; closing or replacing it revokes its key.
    for key in inner.invitations.keys() {
        host.gate.remove(key);
    }
    inner.invitations.clear();
    let join = Identity::generate()?;
    let key = join.fingerprint()?;
    let expires = now() + 15 * 60;
    host.gate.allow(key.clone(), Some(expires));
    inner.invitations.insert(key, Invitation { expires });
    let invitation = json!({"version":VERSION,"name":name(),"fingerprint":identity.fingerprint()?,"addresses":addresses(&inner),"identity":join,"expires":expires});
    let code = URL_SAFE_NO_PAD.encode(serde_json::to_vec(&invitation).map_err(|e| e.to_string())?);
    Ok(json!({"url":format!("molfar://pair?i={code}"),"expires":expires}))
}
#[tauri::command]
pub fn mobile_cancel_invite(host: State<'_, MobileHost>) {
    let mut inner = host.inner.lock().unwrap();
    for key in inner.invitations.keys() {
        host.gate.remove(key);
    }
    inner.invitations.clear();
}
#[tauri::command]
pub fn mobile_revoke(host: State<'_, MobileHost>, device_id: String) -> Result<(), String> {
    let mut inner = host
        .inner
        .lock()
        .map_err(|_| "Mobile service unavailable")?;
    let mut config = inner.config.clone();
    if let Some(device) = config.devices.iter().find(|v| v.id == device_id) {
        host.gate.remove(&device.fingerprint);
        let peer = device.fingerprint.clone();
        inner.watches.retain(|_, watch| watch.peer != peer);
    }
    config.devices.retain(|device| device.id != device_id);
    save(&host, &config)?;
    inner.config = config;
    Ok(())
}
#[tauri::command]
pub fn mobile_publish(
    window: WebviewWindow,
    host: State<'_, MobileHost>,
    catalog: Value,
) -> Result<(), String> {
    if !crate::window::is_workspace_window(window.label()) {
        return Err("Only workspace windows can publish mobile data".into());
    }
    if !catalog["projects"].is_array()
        || !catalog["familiars"].is_array()
        || !catalog["sessions"].is_array()
    {
        return Err("Invalid mobile catalog".into());
    }
    host.inner
        .lock()
        .map_err(|_| "Mobile service unavailable")?
        .catalogs
        .insert(window.label().into(), catalog);
    Ok(())
}
#[tauri::command]
pub fn mobile_reply(
    window: WebviewWindow,
    host: State<'_, MobileHost>,
    id: String,
    response: Value,
) {
    let mut inner = host.inner.lock().unwrap();
    if inner
        .pending
        .get(&id)
        .is_some_and(|pending| pending.window == window.label())
    {
        if let Some(pending) = inner.pending.remove(&id) {
            let _ = pending.reply.send(response);
        }
    }
}
/// The owning window's next update for a watch. "busy" means the phone has not
/// taken the last ones yet: keep the baseline and send again later.
#[tauri::command]
pub fn mobile_push(
    window: WebviewWindow,
    host: State<'_, MobileHost>,
    id: String,
    update: Value,
) -> Result<(), String> {
    let mut inner = host
        .inner
        .lock()
        .map_err(|_| "Mobile service unavailable")?;
    let watch = inner
        .watches
        .get(&id)
        .filter(|watch| watch.window == window.label())
        .ok_or("gone")?;
    match watch.sink.try_send(update) {
        Ok(()) => Ok(()),
        Err(tokio::sync::mpsc::error::TrySendError::Full(_)) => Err("busy".into()),
        Err(tokio::sync::mpsc::error::TrySendError::Closed(_)) => {
            inner.watches.remove(&id);
            Err("gone".into())
        }
    }
}
