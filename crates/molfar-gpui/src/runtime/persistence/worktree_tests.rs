use super::*;

#[test]
fn worktree_creation_follows_message_acceptance_and_reports_the_checkout_in_the_final_update() {
    let root = std::env::temp_dir().join(format!(
        "molfar-optimistic-worktree-{}",
        molfar_core::familiar::new_id()
    ));
    let repo = root.join("repo");
    std::fs::create_dir_all(&repo).unwrap();
    for args in [
        vec!["init", "-q"],
        vec![
            "-c",
            "user.name=Test",
            "-c",
            "user.email=test@example.com",
            "commit",
            "--allow-empty",
            "-qm",
            "Initial",
        ],
    ] {
        let result = std::process::Command::new("git")
            .current_dir(&repo)
            .args(args)
            .output()
            .unwrap();
        assert!(
            result.status.success(),
            "{}",
            String::from_utf8_lossy(&result.stderr)
        );
    }
    let store = Store::open(std::path::Path::new(":memory:")).unwrap();
    let mut summary = store.create("codex", repo.to_str().unwrap()).unwrap();
    summary.provider = "invalid-test-provider".into();
    let id = summary.id;
    let store = Arc::new(Mutex::new(store));
    let (tx, rx) = async_channel::bounded(8);
    let (_control, controls) = std::sync::mpsc::channel();
    run_turn(
        summary,
        "Create the checkout".into(),
        Settings {
            new_worktree: true,
            ..Default::default()
        },
        controls,
        store.clone(),
        Arc::new(AtomicBool::new(false)),
        tx,
    );
    let first = rx.try_recv().unwrap();
    assert!(!first.finished);
    assert_eq!(first.status, "Creating worktree…");
    assert_eq!(first.rows[0].text, "Create the checkout");
    assert!(first.worktree_cwd.is_none());
    let created = rx.try_recv().unwrap();
    let cwd = created.worktree_cwd.unwrap();
    assert!(std::path::Path::new(&cwd).is_dir());
    let finished = rx.try_recv().unwrap();
    assert!(finished.finished);
    assert_eq!(finished.worktree_cwd.as_deref(), Some(cwd.as_str()));
    let store = locked(&store).unwrap();
    let settings = store.agent_settings(id).unwrap().unwrap();
    assert!(!settings.new_worktree);
    assert_eq!(settings.worktree_cwd.as_deref(), Some(cwd.as_str()));
    let rows = store.load(id).unwrap().rows;
    assert_eq!(
        rows.iter()
            .filter(|row| row.first && row.is_prompt())
            .count(),
        1
    );
    assert_eq!(rows[0].text, "Create the checkout");
    std::fs::remove_dir_all(root).unwrap();
}
