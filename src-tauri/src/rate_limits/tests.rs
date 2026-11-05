use super::*;

#[test]
fn claude_credentials_note_whether_the_cli_can_renew_them() {
    let renewable =
        credentials_from_blob(r#"{"claudeAiOauth":{"accessToken":"a","refreshToken":"r"}}"#)
            .unwrap();
    assert!(renewable.refreshable);
    let wiped = credentials_from_blob(r#"{"claudeAiOauth":{"accessToken":"a","refreshToken":""}}"#)
        .unwrap();
    assert!(!wiped.refreshable);
    // The footer must not read the stale-usage note as a sign-out.
    let message = renews_on_next_message().error.unwrap().to_lowercase();
    assert!(!["expired", "sign-in", "not signed in", "authentication"]
        .iter()
        .any(|word| message.contains(word)));
}

#[test]
fn extract_access_token_from_claude_credentials() {
    let raw = r#"{"claudeAiOauth":{"accessToken":"sk-ant-oat-abc","refreshToken":"r"}}"#;
    assert_eq!(extract_access_token(raw).as_deref(), Some("sk-ant-oat-abc"));
}

#[test]
fn extract_access_token_from_flat_object() {
    assert_eq!(
        extract_access_token(r#"{"accessToken":"token-1"}"#).as_deref(),
        Some("token-1")
    );
}

#[test]
fn extract_access_token_rejects_empty() {
    assert_eq!(
        extract_access_token(r#"{"claudeAiOauth":{"accessToken":"  "}}"#),
        None
    );
    assert_eq!(extract_access_token("not json"), None);
}

#[test]
fn extract_opencode_go_api_key_from_auth_json() {
    let raw = r#"{"openai":{"type":"oauth"},"opencode-go":{"type":"api","key":"sk-go-abc"}}"#;
    assert_eq!(
        extract_opencode_go_api_key(raw).as_deref(),
        Some("sk-go-abc")
    );
}

#[test]
fn opencode_go_forbidden_maps_to_unavailable() {
    // A valid key without a Go subscription hides the chip
    // instead of rendering an error.
    let fetch = opencode_go_error(403);
    assert_eq!(fetch.status, "unavailable");
    assert_eq!(fetch.http_status, Some(403));

    let fetch = opencode_go_error(500);
    assert_eq!(fetch.status, "error");
}

#[test]
fn extract_opencode_go_api_key_rejects_missing_or_empty() {
    assert_eq!(
        extract_opencode_go_api_key(r#"{"openai":{"type":"oauth"}}"#),
        None
    );
    assert_eq!(
        extract_opencode_go_api_key(r#"{"opencode-go":{"key":"  "}}"#),
        None
    );
    assert_eq!(extract_opencode_go_api_key("not json"), None);
}

#[test]
fn opencode_data_dir_prefers_explicit_override() {
    std::env::set_var("OPENCODE_DATA_DIR", "/tmp/custom-data");
    assert_eq!(opencode_data_dir(), Some(PathBuf::from("/tmp/custom-data")));
    std::env::remove_var("OPENCODE_DATA_DIR");
}

#[test]
fn parse_opencode_config_accepts_jsonc() {
    let value = parse_opencode_config(
        r#"{
              // URLs inside strings must not be treated as comments.
              "provider": {
                /* OpenCode Go credentials */
                "opencode-go": {
                  "options": {
                    "apiKey": "sk-go-jsonc",
                    "baseURL": "https://opencode.ai/v1",
                  },
                },
              },
            }"#,
    )
    .unwrap();
    assert_eq!(config_go_api_key(&value).as_deref(), Some("sk-go-jsonc"));
}

#[test]
fn config_go_api_key_reads_provider_options() {
    let value: Value = serde_json::from_str(
            r#"{"provider":{"anthropic":{"options":{"apiKey":"sk-ant-x"}},"opencode-go":{"options":{"apiKey":"sk-go-cfg"}}}}"#,
        )
        .unwrap();
    assert_eq!(config_go_api_key(&value).as_deref(), Some("sk-go-cfg"));
}

#[test]
fn config_go_api_key_falls_through_to_opencode_provider() {
    let value: Value = serde_json::from_str(
        r#"{"provider":{"opencode":{"options":{"apiKey":"sk-go-opencode"}}}}"#,
    )
    .unwrap();
    assert_eq!(config_go_api_key(&value).as_deref(), Some("sk-go-opencode"));
}

#[test]
fn config_go_api_key_ignores_other_providers_and_supports_env() {
    let value: Value =
        serde_json::from_str(r#"{"provider":{"anthropic":{"options":{"apiKey":"sk-ant-x"}}}}"#)
            .unwrap();
    assert_eq!(config_go_api_key(&value), None);

    std::env::set_var("MOLFAR_TEST_GO_KEY", "sk-go-env");
    let value: Value = serde_json::from_str(
        r#"{"provider":{"opencode-go":{"options":{"apiKey":"{env:MOLFAR_TEST_GO_KEY}"}}}}"#,
    )
    .unwrap();
    assert_eq!(config_go_api_key(&value).as_deref(), Some("sk-go-env"));
    std::env::remove_var("MOLFAR_TEST_GO_KEY");
}

#[test]
fn auth_content_blob_without_key_stays_authoritative() {
    // A valid blob without opencode-go means "no key", even when disk
    // credentials exist: no fallback to auth.json.
    std::env::set_var(
        "OPENCODE_AUTH_CONTENT",
        r#"{"openai":{"type":"api","key":"sk-openai-x"}}"#,
    );
    assert_eq!(read_opencode_go_api_key(), None);
    std::env::remove_var("OPENCODE_AUTH_CONTENT");
}

#[test]
fn token_expired_uses_actual_expiry() {
    let now = 1_000_000;
    assert!(!token_expired(Some(now + 1), now));
    assert!(token_expired(Some(now), now));
    assert!(token_expired(Some(now - 1), now));
    assert!(!token_expired(None, now));
}

#[cfg(target_os = "macos")]
#[test]
fn custom_config_dir_selects_claudes_hashed_keychain_service() {
    assert_eq!(
        claude_keychain_service(Some(std::path::Path::new("/tmp/profile"))),
        "Claude Code-credentials-902e721c"
    );
    assert_eq!(claude_keychain_service(None), "Claude Code-credentials");
}
