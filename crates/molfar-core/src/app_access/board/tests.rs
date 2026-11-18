use super::normalize_request_id;

#[test]
fn mutation_request_identity_accepts_matching_ids_and_rejects_conflicts() {
    assert_eq!(
        normalize_request_id(Some(" stable "), None).unwrap(),
        "stable"
    );
    assert_eq!(
        normalize_request_id(None, Some("stable")).unwrap(),
        "stable"
    );
    assert_eq!(
        normalize_request_id(Some(" stable"), Some("stable ")).unwrap(),
        "stable"
    );
    assert!(normalize_request_id(Some("one"), Some("two")).is_err());
    assert!(normalize_request_id(None, None).is_err());
    assert!(normalize_request_id(Some(" "), Some("stable")).is_err());
    assert!(normalize_request_id(Some("stable"), Some("")).is_err());
    assert!(normalize_request_id(Some("line\nbreak"), None).is_err());
}

#[test]
fn request_identity_is_bounded_in_utf8_bytes() {
    let maximum = "é".repeat(64);
    assert_eq!(normalize_request_id(Some(&maximum), None).unwrap(), maximum);
    assert!(normalize_request_id(Some(&"é".repeat(65)), None).is_err());
    assert_eq!(
        normalize_request_id(Some("Case"), Some("case")).unwrap_err(),
        "Conflicting Board request IDs."
    );
}

#[test]
fn update_contract_rejects_unknown_fields_empty_patches_and_invalid_content() {
    use super::parse_update;
    use serde_json::json;

    let valid = json!({"cardId":"card-1", "title":"  Updated  ", "requestId":" retry "});
    let request = parse_update(valid, Some("retry")).unwrap();
    assert_eq!(request.card_id, "card-1");
    assert_eq!(request.title.as_deref(), Some("Updated"));
    assert_eq!(request.request_id, "retry");
    for invalid in [
        json!({"cardId":"card-1"}),
        json!({"cardId":"card-1", "title":null}),
        json!({"cardId":"card-1", "title":"Changed", "requestId":""}),
        json!({"cardId":"../card", "title":"Changed"}),
        json!({"cardId":"card-1", "title":" "}),
        json!({"cardId":"card-1", "description":" "}),
        json!({"cardId":"card-1", "title":"Changed", "column":"done"}),
        json!({"cardId":"card-1", "title":"Changed", "requestId":"other"}),
        json!({"cardId":"card-1", "title":"é".repeat(101)}),
    ] {
        assert!(
            parse_update(invalid.clone(), Some("retry")).is_err(),
            "{invalid}"
        );
    }
    assert!(parse_update(json!({"cardId":"card-1", "title":"Changed"}), None).is_err());
    let clear = parse_update(
        json!({"cardId":"card-1", "acceptanceCriteria":"  "}),
        Some("retry"),
    )
    .unwrap();
    assert_eq!(clear.acceptance_criteria.as_deref(), Some(""));
}

#[test]
fn update_content_limits_match_board_creation_limits() {
    use super::parse_update;
    use crate::task_board::constants::{MAX_CRITERIA, MAX_DESCRIPTION, MAX_TITLE};
    use serde_json::json;

    for (field, max) in [
        ("title", MAX_TITLE),
        ("description", MAX_DESCRIPTION),
        ("acceptanceCriteria", MAX_CRITERIA),
    ] {
        let mut input = json!({"cardId":"card-1"});
        input[field] = json!("x".repeat(max));
        assert!(parse_update(input.clone(), Some("retry")).is_ok());
        input[field] = json!("x".repeat(max + 1));
        assert!(parse_update(input, Some("retry")).is_err());
    }
    for input in [
        json!(null),
        json!([]),
        json!({"cardId":"card-1", "title":12}),
        json!({"cardId":"card-1", "title":"Valid", "description":null}),
        json!({"cardId":"card-1", "acceptanceCriteria":false}),
    ] {
        assert!(parse_update(input, Some("retry")).is_err());
    }
}
