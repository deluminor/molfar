use super::*;

#[test]
fn github_comment_input_rejects_empty_or_unknown() {
    assert_eq!(
        github_comment_input("issue", 12, "Looks good").unwrap(),
        ("issue", "Looks good")
    );
    assert!(github_comment_input("issue", 12, "  ").is_err());
    assert!(github_comment_input("gist", 12, "Hi").is_err());
    assert!(github_comment_input("pr", 0, "Hi").is_err());
}

#[test]
fn valid_github_node_id_allows_graphql_ids() {
    assert!(valid_github_node_id("PRRT_kwDOBQfyJc5nX8x-"));
    assert!(valid_github_node_id("IC_kwDOA=="));
    assert!(!valid_github_node_id(""));
    assert!(!valid_github_node_id("thread id"));
    assert!(!valid_github_node_id("id\nPRRT_1"));
}

#[test]
fn github_url_from_output_reads_the_last_http_line() {
    assert_eq!(
        github_url_from_output(
            "Posted\nhttps://github.com/acme/web/issues/1#issuecomment-9\n",
            "missing"
        )
        .unwrap(),
        "https://github.com/acme/web/issues/1#issuecomment-9"
    );
    assert_eq!(
        github_url_from_output("", "GitHub did not return a comment URL").unwrap_err(),
        "GitHub did not return a comment URL"
    );
}

#[test]
fn parse_github_review_reply_url_reads_graphql() {
    let json = r#"{
            "data": {
                "addPullRequestReviewThreadReply": {
                    "comment": { "url": "https://github.com/acme/web/pull/1#discussion_r9" }
                }
            }
        }"#;
    assert_eq!(
        parse_github_review_reply_url(json).unwrap(),
        "https://github.com/acme/web/pull/1#discussion_r9"
    );
    let error = parse_github_review_reply_url(
        r#"{"data":null,"errors":[{"message":"Could not resolve to a node"}]}"#,
    )
    .unwrap_err();
    assert!(error.contains("Could not resolve to a node"));
}
