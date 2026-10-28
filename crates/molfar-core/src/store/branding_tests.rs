use super::desktop_database;

#[test]
fn native_identity_and_desktop_database_match_molfar_contracts() {
    assert_eq!(crate::app_update::APP_ID, "com.molfar.native");
    assert!(desktop_database().ends_with("com.molfar.desktop/molfar.db"));
}

#[test]
fn shared_preference_keys_match_react_sources() {
    let native = concat!(
        include_str!("../desktop_preferences.rs"),
        include_str!("../desktop_preferences/session_defaults.rs"),
        include_str!("../desktop_preferences/workspace_preferences.rs"),
        include_str!("../desktop_preferences/webview.rs"),
    );
    let react = concat!(
        include_str!("../../../../src/features/settings/model/appearance.ts"),
        include_str!("../../../../src/features/sessions/model/models.ts"),
        include_str!("../../../../src/features/projects/model/recents.ts"),
    );
    for key in [
        "molfar.workspaceTheme",
        "molfar.defaultModels",
        "molfar.recentProjects",
        "molfar.lastModel",
    ] {
        assert!(native.contains(key), "Native preference missing: {key}");
        assert!(react.contains(key), "React preference missing: {key}");
    }
}
