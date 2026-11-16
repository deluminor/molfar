use super::settings::{apply, SettingsPatch};
use super::verify_commands::verify_command;

#[test]
fn verify_commands_save_per_project_trim_and_clear() {
    let patch = |command: Option<&str>| SettingsPatch::VerifyCommand {
        project: "/code/app".into(),
        command: command.map(str::to_owned),
    };

    let saved = apply(None, &patch(Some("  npm run check:web  "))).unwrap();
    assert_eq!(
        verify_command(Some(&saved), "/code/app").as_deref(),
        Some("npm run check:web")
    );
    assert_eq!(verify_command(Some(&saved), "/code/other"), None);

    let cleared = apply(Some(&saved), &patch(Some("   "))).unwrap();
    assert_eq!(verify_command(Some(&cleared), "/code/app"), None);

    let long = "x".repeat(2_001);
    assert!(apply(None, &patch(Some(&long))).is_err());
    assert!(apply(Some(r#"{"verifyCommands":{"/a":7}}"#), &patch(None)).is_err());
}
