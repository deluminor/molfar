use super::*;

#[test]
fn parse_github_pr_diff_meta_reads_files_and_totals() {
    let json = r#"{
            "additions": 971,
            "deletions": 225,
            "files": [
                {"path": "next.config.ts", "additions": 4, "deletions": 0},
                {"path": "package.json", "additions": 2, "deletions": 2}
            ]
        }"#;
    let diff = parse_github_pr_diff_meta(json).unwrap();
    assert_eq!(diff.additions, 971);
    assert_eq!(diff.deletions, 225);
    assert_eq!(diff.files.len(), 2);
    assert_eq!(diff.files[0].path, "next.config.ts");
    assert_eq!(diff.files[0].additions, 4);
    assert_eq!(diff.patch, "");
    assert!(!diff.truncated);
}

#[test]
fn parse_github_pr_oids_reads_base_and_head() {
    let json = r#"{
            "baseRefOid": "aaa111",
            "headRefOid": "bbb222",
            "files": []
        }"#;
    assert_eq!(
        parse_github_pr_oids(json).unwrap(),
        ("aaa111".into(), "bbb222".into())
    );
}
