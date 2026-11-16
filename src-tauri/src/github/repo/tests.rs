use super::*;

#[test]
fn parse_github_repositories_includes_a_forks_parent() {
    let json = r#"{
            "nameWithOwner": "EricRasputin/molfar-eric",
            "parent": {
                "name": "molfar",
                "owner": { "login": "deluminor" }
            }
        }"#;
    assert_eq!(
        parse_github_repositories(json).unwrap(),
        vec!["EricRasputin/molfar-eric", "deluminor/molfar"]
    );
}

#[test]
fn parse_github_repositories_keeps_a_normal_repo_single() {
    let json = r#"{
            "nameWithOwner": "deluminor/molfar",
            "parent": null
        }"#;
    assert_eq!(
        parse_github_repositories(json).unwrap(),
        vec!["deluminor/molfar"]
    );
}

#[test]
fn split_github_repo_reads_owner_and_name() {
    assert_eq!(
        split_github_repo(" deluminor/molfar ").unwrap(),
        ("deluminor".into(), "molfar".into())
    );
    assert!(split_github_repo("molfar").is_err());
    assert!(split_github_repo("acme/web extra").is_err());
}
