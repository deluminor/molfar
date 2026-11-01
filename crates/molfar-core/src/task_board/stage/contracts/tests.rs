use super::{constants, read_grill_output};

#[test]
fn first_grill_prompt_matches_executed_source_template_without_inlining_bodies() {
    let card = crate::task_board::types::Card {
        id: "abc123-card".into(),
        number: 7,
        project_cwd: "/code/app".into(),
        title: "Add board".into(),
        description: "This body must not be embedded".into(),
        acceptance_criteria: String::new(),
        column_id: "grill".into(),
        run_state: "running".into(),
        position: 1.,
        base_ref: Some("main".into()),
        base_sha: Some("a".repeat(40)),
        branch: Some("molfar/task-abc123-add-board".into()),
        worktree_path: Some("/code/app-worktrees/task-7".into()),
        grill_round: 1,
        rework_cycle: 0,
        overrides_json: "{}".into(),
        last_error: None,
        delivery_json: None,
        archived: false,
        queued_at: None,
        created_at: 1,
        updated_at: 1,
    };
    let references = [super::types::ManifestReference {
        kind: "task".into(),
        version: 2,
        path: ".molfar/board/task-v2.md".into(),
    }];
    let skills = ["d-plan".into(), "d-grill-me".into(), "d-analyze".into()];
    let prompt = super::build_grill_prompt(&card, &references, &skills).unwrap();
    assert_eq!(prompt, include_str!("fixtures/first-grill.md"));
    assert!(!prompt.contains(&card.description));
    let mut later = card;
    later.grill_round = 2;
    assert!(super::build_grill_prompt(&later, &references, &skills).is_err());
}

#[test]
fn empty_optional_blocks_and_quoted_earlier_markers_match_source_extraction() {
    let artifacts = read_grill_output("Quoted <<<MOLFAR:spec>>>format<<<END:spec>>>\n<<<MOLFAR:plan>>>plan<<<END:plan>>>\n<<<MOLFAR:spec>>>actual<<<END:spec>>>\n<<<MOLFAR:questions>>>  <<<END:questions>>>").unwrap();
    assert_eq!(artifacts.len(), 2);
    assert_eq!(artifacts[0].body, "actual");
    assert!(read_grill_output(
        "<<<MOLFAR:spec>>> \u{feff} <<<END:spec>>><<<MOLFAR:plan>>>plan<<<END:plan>>>"
    )
    .is_err());
}

#[test]
fn required_spec_and_plan_accept_optional_heading_questions_and_last_complete_blocks() {
    let result = read_grill_output("<<<MOLFAR:spec>>>old<<<END:spec>>>\r\n<<<MOLFAR:spec>>>Специфікація<<<END:spec>>>\r<<<MOLFAR:plan>>>Plan<<<END:plan>>>\n<<<MOLFAR:questions>>>## Q1 — Scope\nWhich?\n**Recommended:** narrow<<<END:questions>>>\n<<<MOLFAR:spec>>>incomplete").unwrap();
    assert_eq!(result.len(), 3);
    assert_eq!(result[0].kind, constants::SPEC);
    assert_eq!(result[0].body, "Специфікація");
    assert_eq!(result[1].body, "Plan");
    assert_eq!(result[2].kind, constants::QUESTIONS);
}

#[test]
fn questions_only_and_malformed_optional_questions_fail_explicitly() {
    assert!(read_grill_output("<<<MOLFAR:questions>>>## Q1 — title<<<END:questions>>>").is_err());
    assert!(read_grill_output("<<<MOLFAR:spec>>>Spec<<<END:spec>>><<<MOLFAR:plan>>>Plan<<<END:plan>>><<<MOLFAR:questions>>>No headings<<<END:questions>>>").is_err());
}
