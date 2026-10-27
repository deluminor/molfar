use super::*;

#[test]
fn parse_github_work_item_thread_merges_conversation() {
    let json = r#"{
            "data": {
                "repository": {
                    "pullRequest": {
                        "reviewDecision": "APPROVED",
                        "baseRefName": "main",
                        "headRefName": "agent-terminal",
                        "commits": {
                            "totalCount": 2,
                            "nodes": [
                                {
                                    "commit": {
                                        "oid": "abcdef123456",
                                        "messageHeadline": "Show linked activity",
                                        "committedDate": "2026-08-31T11:45:00Z",
                                        "url": "https://github.com/acme/web/commit/abcdef123456",
                                        "author": {
                                            "name": "Maya Smith",
                                            "user": {"login": "maya"}
                                        }
                                    }
                                }
                            ]
                        },
                        "comments": {
                            "totalCount": 50,
                            "nodes": [
                                {
                                    "id": "IC_1",
                                    "author": {"login": "maya"},
                                    "body": "Looks good",
                                    "createdAt": "2026-08-31T10:00:00Z",
                                    "url": "https://github.com/acme/web/pull/1#issuecomment-1",
                                    "isMinimized": false
                                },
                                {
                                    "id": "IC_hidden",
                                    "author": {"login": "bot"},
                                    "body": "hidden",
                                    "createdAt": "2026-08-31T10:05:00Z",
                                    "isMinimized": true
                                }
                            ]
                        },
                        "reviews": {
                            "totalCount": 2,
                            "nodes": [
                                {
                                    "id": "PRR_empty",
                                    "author": {"login": "ada"},
                                    "body": "",
                                    "state": "COMMENTED",
                                    "submittedAt": "2026-08-31T11:00:00Z"
                                },
                                {
                                    "id": "PRR_2",
                                    "author": {"login": "ada"},
                                    "body": "Ship it",
                                    "state": "APPROVED",
                                    "submittedAt": "2026-08-31T12:00:00Z",
                                    "url": "https://github.com/acme/web/pull/1#pullrequestreview-2"
                                }
                            ]
                        },
                        "reviewThreads": {
                            "totalCount": 1,
                            "nodes": [
                                {
                                    "id": "PRRT_1",
                                    "isResolved": true,
                                    "path": "src/app.ts",
                                    "comments": {
                                        "totalCount": 2,
                                        "nodes": [
                                            {
                                                "id": "PRRC_1",
                                                "author": {"login": "lin"},
                                                "body": "Nit: name",
                                                "createdAt": "2026-08-31T11:30:00Z",
                                                "url": "https://github.com/acme/web/pull/1#discussion_r1",
                                                "path": "src/app.ts",
                                                "line": 12,
                                                "isMinimized": false
                                            },
                                            {
                                                "id": "PRRC_2",
                                                "author": {"login": "maya"},
                                                "body": "Fixed",
                                                "createdAt": "2026-08-31T11:40:00Z",
                                                "path": "src/app.ts",
                                                "line": 12,
                                                "isMinimized": false
                                            }
                                        ]
                                    }
                                }
                            ]
                        }
                    }
                }
            }
        }"#;
    let thread = parse_github_work_item_thread(json, "pr").unwrap();
    assert!(thread.truncated);
    assert_eq!(thread.review_decision, "APPROVED");
    assert_eq!(thread.base_ref_name, "main");
    assert_eq!(thread.head_ref_name, "agent-terminal");
    assert_eq!(thread.commits.len(), 1);
    assert_eq!(thread.commits[0].oid, "abcdef123456");
    assert_eq!(thread.commits[0].message_headline, "Show linked activity");
    assert_eq!(thread.commits[0].author, "maya");
    assert_eq!(
        thread
            .comments
            .iter()
            .map(|comment| comment.id.as_str())
            .collect::<Vec<_>>(),
        ["IC_1", "PRRC_1", "PRR_2"]
    );
    assert_eq!(thread.comments[1].kind, "review_comment");
    assert_eq!(thread.comments[1].path, "src/app.ts");
    assert_eq!(thread.comments[1].line, Some(12));
    assert_eq!(thread.comments[1].thread_id, "PRRT_1");
    assert!(thread.comments[1].resolved);
    assert_eq!(thread.comments[1].replies.len(), 1);
    assert_eq!(thread.comments[1].replies[0].author, "maya");
    assert_eq!(thread.comments[1].replies[0].thread_id, "PRRT_1");
    assert_eq!(thread.comments[2].kind, "review");
    assert_eq!(thread.comments[2].state, "APPROVED");
}

#[test]
fn parse_github_work_item_thread_reads_issue_comments() {
    let json = r#"{
            "data": {
                "repository": {
                    "issue": {
                        "comments": {
                            "totalCount": 1,
                            "nodes": [
                                {
                                    "id": "IC_9",
                                    "author": {"login": "maya"},
                                    "body": "Still happens",
                                    "createdAt": "2026-08-31T09:00:00Z"
                                }
                            ]
                        }
                    }
                }
            }
        }"#;
    let thread = parse_github_work_item_thread(json, "issue").unwrap();
    assert!(!thread.truncated);
    assert_eq!(thread.comments.len(), 1);
    assert_eq!(thread.comments[0].author, "maya");
    assert_eq!(thread.comments[0].body, "Still happens");
}

#[test]
fn parse_github_work_item_thread_reads_graphql_errors() {
    let json = r#"{
            "data": {"repository": null},
            "errors": [{"message": "Could not resolve to a Repository"}]
        }"#;
    let error = parse_github_work_item_thread(json, "pr").unwrap_err();
    assert!(error.contains("Could not resolve to a Repository"));
}
