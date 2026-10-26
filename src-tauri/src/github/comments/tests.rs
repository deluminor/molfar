use super::*;

#[test]
fn github_avatar_url_encodes_bot_logins() {
    assert_eq!(
        github_avatar_url("dependabot[bot]"),
        "https://avatars.githubusercontent.com/dependabot%5Bbot%5D?s=64"
    );
    assert_eq!(github_avatar_url("  "), "");
}
