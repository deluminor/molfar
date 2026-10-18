use std::path::{Path, PathBuf};
use std::process::Command;

use rusqlite::Connection;

use super::artifacts::{self, ArtifactWrite};
use super::materialize::{self, InputRef};
use super::types::{CardCreate, CardPatch};
use super::{cards, schema};

fn temp_dir(label: &str) -> PathBuf {
    let dir = std::env::temp_dir().join(format!("molfar-{label}-{}", uuid::Uuid::new_v4()));
    std::fs::create_dir_all(&dir).unwrap();
    dir
}

fn git(cwd: &Path, args: &[&str]) -> String {
    let out = Command::new("git")
        .args(args)
        .current_dir(cwd)
        .output()
        .unwrap();
    assert!(out.status.success(), "git {args:?} failed");
    String::from_utf8(out.stdout).unwrap()
}

fn card_with_worktree(conn: &mut Connection, worktree: &Path) {
    let create = CardCreate {
        id: "a".into(),
        project_cwd: "/code/app".into(),
        title: "Add board".into(),
        description: "Build the board".into(),
        acceptance_criteria: String::new(),
        base_ref: Some("main".into()),
    };
    let card = cards::create(conn, &create, 1).unwrap();
    let patch = CardPatch {
        worktree_path: Some(Some(worktree.display().to_string())),
        ..CardPatch::default()
    };
    cards::update(conn, "a", card.updated_at, &patch, 2).unwrap();
}

fn write_spec(conn: &mut Connection, base: &Path, body: &str) {
    let input = ArtifactWrite {
        card_id: "a",
        kind: "spec",
        source: "stage",
        stage_run_id: None,
        body,
    };
    artifacts::write(conn, base, &input, 3).unwrap();
}

#[test]
fn materialized_inputs_are_files_git_never_sees() {
    let mut conn = Connection::open_in_memory().unwrap();
    schema::ensure_tables(&conn).unwrap();
    let (base, worktree) = (temp_dir("board-base"), temp_dir("board-tree"));
    git(&worktree, &["init", "-q"]);
    card_with_worktree(&mut conn, &worktree);
    write_spec(&mut conn, &base, "first");
    write_spec(&mut conn, &base, "second");

    let old = materialize::prepare(
        &conn,
        &base,
        "a",
        &[InputRef {
            kind: "spec".into(),
            version: 1,
        }],
    )
    .unwrap();
    materialize::write(&old).unwrap();
    let new = materialize::prepare(
        &conn,
        &base,
        "a",
        &[InputRef {
            kind: "spec".into(),
            version: 2,
        }],
    )
    .unwrap();
    let paths = materialize::write(&new).unwrap();

    assert_eq!(paths, vec![".molfar/board/spec-v2.md".to_string()]);
    assert_eq!(
        std::fs::read_to_string(worktree.join(&paths[0])).unwrap(),
        "second"
    );
    assert!(!worktree.join(".molfar/board/spec-v1.md").exists());
    assert_eq!(
        git(
            &worktree,
            &["status", "--porcelain", "--untracked-files=all"]
        ),
        ""
    );
    assert_eq!(
        git(&worktree, &["ls-files", "-o", "--exclude-standard"]),
        ""
    );
}

#[test]
fn materialize_rejects_unknown_versions_and_missing_worktrees() {
    let mut conn = Connection::open_in_memory().unwrap();
    schema::ensure_tables(&conn).unwrap();
    let base = temp_dir("board-base");
    let worktree = temp_dir("board-tree");
    card_with_worktree(&mut conn, &worktree);
    let unknown = [InputRef {
        kind: "spec".into(),
        version: 9,
    }];

    assert!(materialize::prepare(&conn, &base, "a", &unknown).is_err());
    std::fs::remove_dir_all(&worktree).unwrap();
    assert!(materialize::prepare(&conn, &base, "a", &[]).is_err());
}

#[cfg(unix)]
#[test]
fn materialize_refuses_a_symlinked_board_folder() {
    let mut conn = Connection::open_in_memory().unwrap();
    schema::ensure_tables(&conn).unwrap();
    let (base, worktree, elsewhere) = (
        temp_dir("board-base"),
        temp_dir("board-tree"),
        temp_dir("board-elsewhere"),
    );
    card_with_worktree(&mut conn, &worktree);
    std::os::unix::fs::symlink(&elsewhere, worktree.join(".molfar")).unwrap();

    let prepared = materialize::prepare(&conn, &base, "a", &[]).unwrap();

    assert!(materialize::write(&prepared).is_err());
    assert!(!elsewhere.join("board").exists());
}
