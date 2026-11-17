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
