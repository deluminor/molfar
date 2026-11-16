//! Per-window chrome the web view toggles: traffic lights, background blur, Dock badge, trackpad zoom.

#[tauri::command]
pub fn set_traffic_lights_visible(
    #[allow(unused_variables)] window: tauri::WebviewWindow,
    #[allow(unused_variables)] visible: bool,
) {
    #[cfg(target_os = "macos")]
    crate::macos::set_visible(&window, visible);
}

#[tauri::command]
pub fn set_window_background_blur(
    #[allow(unused_variables)] window: tauri::WebviewWindow,
    #[allow(unused_variables)] radius: u8,
) {
    #[cfg(target_os = "macos")]
    crate::macos::set_background_blur_radius(&window, radius);
}

#[tauri::command]
pub fn set_dock_badge(
    #[allow(unused_variables)] window: tauri::WebviewWindow,
    #[allow(unused_variables)] count: u32,
) {
    #[cfg(target_os = "macos")]
    crate::macos::set_window_badge(&window, count);
}

#[tauri::command]
pub fn set_trackpad_zoom_enabled(
    #[allow(unused_variables)] window: tauri::WebviewWindow,
    #[allow(unused_variables)] enabled: bool,
) {
    #[cfg(target_os = "macos")]
    crate::trackpad_zoom::set_enabled(&window, enabled);
}
