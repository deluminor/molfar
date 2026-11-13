use super::super::{super::*, fixtures::*};
use gpui::TestAppContext;
use molfar_core::{
    agent::{AccessMode, Settings},
    task_board::stage::{
        agent::AgentStage,
        choice::{self, types::ResolvedStageChoice},
    },
};

fn queued(fixture: &Fixture, stage: AgentStage) -> molfar_core::task_board::types::Card {
    let store = locked(&fixture.store).unwrap();
    let conn = rusqlite::Connection::open(store.database_path()).unwrap();
    conn.execute(
        "UPDATE task_board_cards SET column_id=?1,run_state='queued' WHERE id='card'",
        [stage.id()],
    )
    .unwrap();
    for kind in ["spec", "plan", "impl_report", "review", "rework_brief"] {
        let body = if kind == "review" {
            "Verdict: APPROVE"
        } else {
            "Fixture artifact"
        };
        std::fs::write(
            fixture.root.join(format!("task-board/card/{kind}-1.md")),
            body,
        )
        .unwrap();
        conn.execute("INSERT INTO task_board_artifacts(id,card_id,kind,version,source,created_at) VALUES(?1,'card',?1,1,'stage',1)",[kind]).unwrap();
    }
    drop(store);
    locked(&fixture.store)
        .unwrap()
        .board_claim_next_stage()
        .unwrap()
        .unwrap()
}

#[gpui::test]
fn accepted_and_prepared_execution_stages_restart_without_replaying(cx: &mut TestAppContext) {
    for stage in [
        AgentStage::Implement,
        AgentStage::CodeReview,
        AgentStage::Rework,
    ] {
        for prepared in [false, true] {
            let fixture = Fixture::new();
            let card = queued(&fixture, stage);
            if prepared {
                let defaults = prepare::Defaults {
                    fixture: Some(fixture.provider.clone()),
                    card,
                    selection: choice::select(stage, None, "{}", Kind::Codex).unwrap(),
                    model: None,
                    account: Default::default(),
                    disabled_skills: vec![],
                };
                assert!(matches!(
                    prepare::prepare(&fixture.store, "recovery", defaults).unwrap(),
                    prepare::Prepared::Launch(_)
                ));
            } else {
                let resolved = ResolvedStageChoice {
                    kind: Kind::Codex,
                    model: "gpt-test".into(),
                    settings: Settings {
                        model: Some("gpt-test".into()),
                        access: AccessMode::Auto,
                        ..Default::default()
                    },
                    runtime_mode: "auto".into(),
                    skills: vec![],
                    warnings: vec![],
                    model_settings: serde_json::json!({}),
                };
                locked(&fixture.store)
                    .unwrap()
                    .board_accept_stage("card", card.updated_at, "recovery", &resolved)
                    .unwrap();
            }
            let path = locked(&fixture.store).unwrap().database_path().to_owned();
            *locked(&fixture.store).unwrap() =
                molfar_core::store::Store::open_desktop(&path).unwrap();
            let window = fixture.window(cx);
            window
                .update(cx, |shell, _, cx| shell.poll_board(true, cx))
                .unwrap();
            wait_until(cx, || fixture.card().run_state == "failed");
            let context = locked(&fixture.store)
                .unwrap()
                .board_stage_context("recovery")
                .unwrap()
                .unwrap();
            assert_eq!(context.run.status, "interrupted");
            assert_eq!(context.card.column_id, stage.id());
            assert!(!fixture.root.join("submissions").exists());
        }
    }
}

#[test]
fn completed_execution_receipts_settle_after_restart_once_without_provider_replay() {
    for stage in [
        AgentStage::Implement,
        AgentStage::CodeReview,
        AgentStage::Rework,
    ] {
        let fixture = Fixture::new();
        let original = molfar_core::task_board::stage::checkout::snapshot(std::path::Path::new(
            &fixture.project,
        ))
        .unwrap();
        let card = queued(&fixture, stage);
        let defaults = prepare::Defaults {
            fixture: Some(fixture.provider.clone()),
            card,
            selection: choice::select(stage, None, "{}", Kind::Codex).unwrap(),
            model: None,
            account: Default::default(),
            disabled_skills: vec![],
        };
        let launch = match prepare::prepare(&fixture.store, "receipt-run", defaults).unwrap() {
            prepare::Prepared::Launch(launch) => launch,
            _ => panic!("Preparation failed"),
        };
        let store = locked(&fixture.store).unwrap();
        let persisted = store.persisted_session_id(launch.summary.id).unwrap();
        let context = store.board_stage_context("receipt-run").unwrap().unwrap();
        let path = store.database_path().to_owned();
        drop(store);
        if !stage.is_read_only() {
            let root = std::path::Path::new(context.card.worktree_path.as_deref().unwrap());
            std::fs::write(root.join("tracked.txt"), "Committed recovery change").unwrap();
            git(root, &["add", "tracked.txt"]);
            git(
                root,
                &[
                    "-c",
                    "user.name=Fixture",
                    "-c",
                    "user.email=fixture@example.test",
                    "-c",
                    "commit.gpgsign=false",
                    "commit",
                    "-qm",
                    "fixture: recovery",
                ],
            );
        }
        let text = if stage == AgentStage::CodeReview {
            "<<<MOLFAR:review>>>Verdict: APPROVE<<<END:review>>>"
        } else {
            "<<<MOLFAR:impl_report>>>Status: complete\nRecovered report<<<END:impl_report>>>"
        };
        let request = format!(
            "app-prompt-{}",
            molfar_core::familiar::files::content_hash("receipt-run")
        );
        let blocks = serde_json::json!([
            {"id":"root","role":"user","text":"Prompt","startedAt":100,"appRequestId":request,"nativeTurnCompletion":{"status":"succeeded","completed_at":200}},
            {"id":"answer","role":"assistant","text":text}
        ]);
        rusqlite::Connection::open(&path)
            .unwrap()
            .execute(
                "UPDATE sessions SET blocks_json=?2 WHERE id=?1",
                rusqlite::params![persisted, blocks.to_string()],
            )
            .unwrap();
        drop(launch);
        *locked(&fixture.store).unwrap() = molfar_core::store::Store::open_desktop(&path).unwrap();
        let effect = settle::settle(&fixture.store, &context, &HashSet::new()).unwrap();
        assert!(effect.changed);
        assert!(
            !settle::settle(&fixture.store, &context, &HashSet::new())
                .unwrap()
                .changed
        );
        assert_eq!(
            locked(&fixture.store)
                .unwrap()
                .board_stage_context("receipt-run")
                .unwrap()
                .unwrap()
                .run
                .status,
            "succeeded"
        );
        assert!(!fixture.root.join("submissions").exists());
        assert_eq!(
            molfar_core::task_board::stage::checkout::snapshot(std::path::Path::new(
                &fixture.project
            ))
            .unwrap(),
            original
        );
    }
}
