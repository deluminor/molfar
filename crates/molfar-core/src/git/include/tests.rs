use super::{intersect, seed};
use crate::git::{create_named_worktree, git};
use std::path::{Path, PathBuf};

fn strings(items: &[&str]) -> Vec<String> {
    items.iter().map(|item| (*item).to_owned()).collect()
}

fn repo(temp: &Path, ignore: &str, include: Option<&str>) -> PathBuf {
    let cwd = temp.join("project");
    std::fs::create_dir(&cwd).unwrap();
    git(&cwd, &["init", "-b", "main"]).unwrap();
    std::fs::write(cwd.join(".gitignore"), ignore).unwrap();
    if let Some(include) = include {
        std::fs::write(cwd.join(".worktreeinclude"), include).unwrap();
    }

    git(&cwd, &["add", "."]).unwrap();
    git(
        &cwd,
        &[
            "-c",
            "user.name=Native test",
            "-c",
            "user.email=native@example.invalid",
            "-c",
            "commit.gpgsign=false",
            "commit",
            "-m",
            "Initial",
        ],
    )
    .unwrap();
    cwd
}

fn write(root: &Path, relative: &str, text: &str) {
    let path = root.join(relative);
    std::fs::create_dir_all(path.parent().unwrap()).unwrap();
    std::fs::write(path, text).unwrap();
}

#[test]
fn intersect_keeps_the_deeper_entry_when_listings_disagree_on_depth() {
    let ignored = strings(&["docs/specs/", "node_modules/", ".env"]);
    let included = strings(&["docs/specs/a.md", "node_modules/", "scratch/"]);

    assert_eq!(
        intersect(&ignored, &included),
        strings(&["docs/specs/a.md", "node_modules/"])
    );
    assert_eq!(
        intersect(&strings(&["app/.env", "app/dist/"]), &strings(&["app/"])),
        strings(&["app/.env", "app/dist/"])
    );
}

#[test]
fn new_worktree_receives_only_included_ignored_paths() {
    let temp = tempfile::tempdir().unwrap();
    let cwd = repo(
        temp.path(),
        "node_modules/\n.env*\ntarget/\nnotes.txt\n",
        Some("node_modules/\n.env*\ntracked.txt\nloose.txt\n"),
    );
    write(&cwd, "node_modules/pkg/index.js", "dep\n");
    write(&cwd, "web/node_modules/pkg/index.js", "nested\n");
    write(&cwd, ".env.local", "SECRET=1\n");
    write(&cwd, "target/debug/app", "binary\n");
    write(&cwd, "notes.txt", "ignored, not included\n");
    write(&cwd, "loose.txt", "included, not ignored\n");

    let tree = create_named_worktree(&cwd, "feature/seed").unwrap();
    let tree = Path::new(&tree.path);

    let read = |relative: &str| std::fs::read_to_string(tree.join(relative)).ok();
    assert_eq!(read("node_modules/pkg/index.js").as_deref(), Some("dep\n"));
    assert_eq!(
        read("web/node_modules/pkg/index.js").as_deref(),
        Some("nested\n")
    );
    assert_eq!(read(".env.local").as_deref(), Some("SECRET=1\n"));
    assert_eq!(read("target/debug/app"), None);
    assert_eq!(read("notes.txt"), None);
    assert_eq!(read("loose.txt"), None);
}

#[test]
fn seeding_never_replaces_an_existing_path() {
    let temp = tempfile::tempdir().unwrap();
    let cwd = repo(temp.path(), ".env\n", Some(".env\n"));
    write(&cwd, ".env", "main\n");
    let tree = temp.path().join("tree");
    write(&tree, ".env", "kept\n");

    assert!(seed(&cwd, &tree).is_empty());
    assert_eq!(
        std::fs::read_to_string(tree.join(".env")).unwrap(),
        "kept\n"
    );
}

#[test]
fn seeding_is_a_no_op_without_an_include_file() {
    let temp = tempfile::tempdir().unwrap();
    let cwd = repo(temp.path(), "node_modules/\n", None);
    write(&cwd, "node_modules/pkg/index.js", "dep\n");
    let tree = temp.path().join("tree");
    std::fs::create_dir(&tree).unwrap();

    assert!(seed(&cwd, &tree).is_empty());
    assert!(!tree.join("node_modules").exists());
}
