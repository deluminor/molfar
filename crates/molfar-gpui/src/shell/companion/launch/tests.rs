use super::*;

fn model() -> Model {
    Model {
        id: "fixture-model".into(),
        name: "Fixture model".into(),
        alias_target: None,
        efforts: vec!["low".into(), "high".into()],
        default_effort: Some("low".into()),
        fast: false,
        thinking: false,
        default: true,
        tiers: Vec::new(),
        controls: Vec::new(),
    }
}

#[test]
fn companion_launch_validates_and_preserves_selected_model_effort_and_workspace() {
    let settings = validated_settings(&json!({"text":"Review","model":"fixture-model","effort":"high","runtimeMode":"auto","workspaceMode":"worktree"}),Kind::Codex,Settings::default(),&[model()]).unwrap();
    assert_eq!(settings.model.as_deref(), Some("fixture-model"));
    assert_eq!(settings.effort.as_deref(), Some("high"));
    assert_eq!(settings.access, AccessMode::Auto);
    let invalid = [
        json!({"text":"Review","model":"missing"}),
        json!({"text":"Review","effort":"missing"}),
        json!({"text":"Review","runtimeMode":"missing"}),
        json!({"text":"Review","workspaceMode":"missing"}),
    ];
    for input in invalid {
        assert!(
            validated_settings(&input, Kind::Codex, Settings::default(), &[model()]).is_err(),
            "{input}"
        );
    }
}

#[test]
fn companion_options_match_phone_launch_contract() {
    let catalog = json!({"harnesses":[{"id":"codex","available":true,"models":[molfar_core::app_access::model_description(Kind::Codex,&model())]},{"id":"claude","available":false,"models":[]}]});
    let choice = super::super::super::new_chat_choice::NewChatChoice {
        kind: Kind::Codex,
        model: Some("fixture-model".into()),
    };
    let value = options("/fixture", &choice, AccessMode::Auto, &catalog);
    assert_eq!(value["project"], "/fixture");
    assert_eq!(
        value["defaults"],
        json!({"harness":"codex","model":"fixture-model","runtimeMode":"auto"})
    );
    assert_eq!(value["harnesses"].as_array().unwrap().len(), 1);
    assert_eq!(
        value["harnesses"][0]["models"][0]["effort"]["options"][1]["value"],
        "high"
    );
}

#[test]
fn companion_options_use_the_catalog_default_when_project_has_no_model() {
    let mut first = model();
    first.id = "first".into();
    first.default = false;
    let catalog = json!({"harnesses":[{"id":"codex","available":true,"models":[app::model_description(Kind::Codex,&first),app::model_description(Kind::Codex,&model())]}]});
    let choice = super::super::super::new_chat_choice::NewChatChoice {
        kind: Kind::Codex,
        model: None,
    };
    assert_eq!(
        options("/fixture", &choice, AccessMode::Auto, &catalog)["defaults"]["model"],
        "fixture-model"
    );
}

#[test]
fn companion_launch_creates_requested_worktree_and_rejects_before_persistence() {
    let root = std::env::temp_dir().join(format!("companion-launch-{}", uuid::Uuid::new_v4()));
    let project = root.join("project");
    std::fs::create_dir_all(&project).unwrap();
    let git = |args: &[&str]| {
        let result = std::process::Command::new("git")
            .args(args)
            .current_dir(&project)
            .env_remove("GIT_DIR")
            .env_remove("GIT_WORK_TREE")
            .output()
            .unwrap();
        assert!(
            result.status.success(),
            "{}",
            String::from_utf8_lossy(&result.stderr)
        );
    };
    git(&["init", "-q"]);
    std::fs::write(project.join("README.md"), "Fixture\n").unwrap();
    git(&["add", "README.md"]);
    git(&[
        "-c",
        "user.name=MOLFAR Fixture",
        "-c",
        "user.email=fixture@localhost",
        "commit",
        "-qm",
        "Fixture",
    ]);
    let store = std::sync::Arc::new(std::sync::Mutex::new(
        molfar_core::store::Store::open(std::path::Path::new(":memory:")).unwrap(),
    ));
    let path = project.to_str().unwrap();
    for input in [
        json!({"text":"Review","model":"missing"}),
        json!({"text":"Review","workspaceMode":"invalid"}),
    ] {
        assert!(
            prepare(
                &store,
                path,
                Kind::Codex,
                &input,
                Settings::default(),
                &[model()],
                || Ok(())
            )
            .is_err()
        );
        assert!(locked(&store).unwrap().sessions().unwrap().is_empty());
    }
    let (summary,settings)=prepare(&store,path,Kind::Codex,&json!({"text":"Review","model":"fixture-model","effort":"high","workspaceMode":"worktree"}),Settings::default(),&[model()],||Ok(())).unwrap();
    let checkout = std::path::Path::new(settings.worktree_cwd.as_ref().unwrap());
    assert_ne!(checkout, project);
    assert!(
        checkout
            .canonicalize()
            .unwrap()
            .starts_with(root.canonicalize().unwrap())
    );
    assert!(checkout.join("README.md").is_file());
    let saved = locked(&store)
        .unwrap()
        .agent_settings(summary.id)
        .unwrap()
        .unwrap();
    assert_eq!(saved.worktree_cwd, settings.worktree_cwd);
    assert_eq!(saved.model.as_deref(), Some("fixture-model"));
    assert_eq!(saved.effort.as_deref(), Some("high"));
    rollback(&store, &summary, &settings, true).unwrap();
    assert!(!checkout.exists());
    assert!(locked(&store).unwrap().sessions().unwrap().is_empty());
    let checks = std::cell::Cell::new(0);
    let expired = prepare(
        &store,
        path,
        Kind::Codex,
        &json!({"text":"Review","workspaceMode":"worktree"}),
        Settings::default(),
        &[model()],
        || {
            let count = checks.get();
            checks.set(count + 1);
            if count == 0 {
                Ok(())
            } else {
                Err("Request expired".into())
            }
        },
    );
    assert!(expired.is_err());
    assert!(locked(&store).unwrap().sessions().unwrap().is_empty());
    let snapshot = molfar_core::git::snapshot(&project).unwrap();
    assert_eq!(snapshot.worktrees.len(), 1);
    assert_eq!(snapshot.branches.len(), 1);
    std::fs::remove_dir_all(root).unwrap();
}
