use super::*;

#[test]
fn confluence_links_round_trip_with_kind_and_preserve_origin_for_resolution() {
    let space = Link::parse("molfar://confluence/WORK.atlassian.net:443/TEAM").unwrap();
    assert_eq!(space.mention().token(), "@confluence/space/TEAM");
    assert_eq!(space.url(), "molfar://confluence/work.atlassian.net/TEAM");
    let mut folder = Link::parse("molfar://confluence/other.atlassian.net/TEAM/42").unwrap();
    folder.kind = Some(Kind::Folder);
    let draft = "See @confluence/folder/42.";
    let prepared = preserve_links(draft, &HashMap::from([(folder.mention().token(), folder)]));
    let result = apply(&prepared, |mention| {
        let link = mention.link.as_ref().unwrap();
        assert_eq!(mention.kind, Kind::Folder);
        assert!(!link.matches_site(&Url::parse("https://work.atlassian.net").unwrap()));
        Err("Wrong site".into())
    });
    assert!(result.starts_with(draft));
    assert!(result.contains("_Could not load Confluence folder 42._"));
    assert!(Link::parse("molfar://confluence/work.atlassian.net/../../42").is_none());
    assert!(Link::parse("molfar://confluence/work.atlassian.net/TEAM/42/extra").is_none());
}

#[test]
fn confluence_mentions_deduplicate_and_skip_quoted_and_fenced_examples() {
    let text = "Use (@confluence/page/42), @confluence/page/42.\n> @confluence/page/17\n```\n@confluence/space/OTHER\n```";
    let mut ids = Vec::new();
    let prompt = apply(text, |mention| {
        ids.push(mention.id.clone());
        Ok("Reference".into())
    });
    assert_eq!(ids, ["42"]);
    assert!(prompt.contains("### @confluence/page/42\n\nReference"));
}
