//! Streams one conversation to a phone as the owning window publishes it.

use super::*;

/// A phone starts watching a conversation. The owning window sends its state,
/// then every change, through `mobile_push` until the phone or window goes.
pub(super) fn watch(
    app: &AppHandle,
    host: &MobileHost,
    peer: &str,
    request: Value,
    sink: molfar_mobile_link::WatchSink,
) -> Result<(), String> {
    if request["version"] != VERSION {
        return Err("Update MOLFAR on both devices".into());
    }
    if request["method"] != "conversation.watch" {
        return Err("Unsupported mobile operation".into());
    }
    let conversation = request["params"]["conversationId"]
        .as_str()
        .filter(|id| !id.is_empty() && id.len() <= 256)
        .ok_or("Missing workspace item")?
        .to_string();
    let mut inner = host
        .inner
        .lock()
        .map_err(|_| "Mobile service unavailable")?;
    if !inner.config.enabled {
        return Err("Mobile access disabled".into());
    }
    if !inner
        .config
        .devices
        .iter()
        .any(|device| device.fingerprint == peer)
    {
        return Err("Device revoked or not paired".into());
    }
    inner.watches.retain(|_, watch| !watch.sink.is_closed());
    if inner
        .watches
        .values()
        .filter(|watch| watch.peer == peer)
        .count()
        >= 4
    {
        return Err("Desktop is busy; try again".into());
    }
    merged_catalog(app, &mut inner);
    let window = pick_owner(&inner.catalogs, "conversation.watch", &conversation)
        .ok_or("This workspace item is no longer available")?;
    let id = uuid::Uuid::new_v4().to_string();
    app.emit_to(
        window.as_str(),
        "molfar-mobile-watch",
        json!({
            "id": id,
            "conversationId": conversation,
            "action": "start",
            // Where the phone wants the watch to open: its latest turns, or on
            // from the first turn it already has.
            "tail": request["params"]["tail"].as_u64(),
            "from": request["params"]["from"].as_str().filter(|from| from.len() <= 256),
            // Opt in: older phones continue receiving complete changed turns.
            "incremental": request["params"]["incremental"] == true,
        }),
    )
    .map_err(|_| "Desktop window is unavailable")?;
    inner.watches.insert(
        id.clone(),
        Watcher {
            window: window.clone(),
            peer: peer.into(),
            sink: sink.clone(),
        },
    );
    drop(inner);
    // End the watch with the phone or the window, whichever goes first.
    let host = host.clone();
    let app = app.clone();
    tauri::async_runtime::spawn(async move {
        loop {
            tokio::select! {
                _ = sink.closed() => break,
                _ = tokio::time::sleep(Duration::from_secs(5)) => {
                    let watching = host.inner.lock().is_ok_and(|inner| inner.watches.contains_key(&id));
                    if !watching || app.get_webview_window(&window).is_none() {
                        break;
                    }
                }
            }
        }
        if let Ok(mut inner) = host.inner.lock() {
            inner.watches.remove(&id);
        }
        let _ = app.emit_to(
            window.as_str(),
            "molfar-mobile-watch",
            json!({"id":id,"action":"stop"}),
        );
    });
    Ok(())
}
