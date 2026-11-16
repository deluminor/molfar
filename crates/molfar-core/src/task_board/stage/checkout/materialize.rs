use crate::task_board::stage::contracts::types::{HandoffInput, ManifestReference};
use std::{
    fs::{self, OpenOptions},
    io::{ErrorKind, Write},
    path::Path,
};

const KINDS: [&str; 10] = [
    "task",
    "spec",
    "plan",
    "questions",
    "answers",
    "impl_report",
    "review",
    "rework_brief",
    "delivery",
    "pr_description",
];
const MAX_BODY: usize = 2_000_000;
const IGNORE: &str = "*\n";

fn directory(path: &Path) -> Result<(), String> {
    match fs::create_dir(path) {
        Ok(()) => {}
        Err(error) if error.kind() == ErrorKind::AlreadyExists => {}
        Err(error) => return Err(error.to_string()),
    }
    let metadata = fs::symlink_metadata(path).map_err(|error| error.to_string())?;
    if !metadata.is_dir() || metadata.file_type().is_symlink() {
        return Err(format!("{} is not a plain folder.", path.display()));
    }
    Ok(())
}

fn target(path: &Path) -> Result<bool, String> {
    match fs::symlink_metadata(path) {
        Ok(metadata) if metadata.is_file() && !metadata.file_type().is_symlink() => Ok(true),
        Ok(_) => Err(format!("{} is not a plain file.", path.display())),
        Err(error) if error.kind() == ErrorKind::NotFound => Ok(false),
        Err(error) => Err(error.to_string()),
    }
}

fn write(path: &Path, body: &str) -> Result<(), String> {
    target(path)?;
    let parent = path.parent().ok_or("Invalid handoff path.")?;
    let temp = parent.join(format!(".{}.tmp", uuid::Uuid::new_v4()));
    let mut options = OpenOptions::new();
    options.write(true).create_new(true);
    #[cfg(unix)]
    {
        use std::os::unix::fs::OpenOptionsExt;
        options.mode(0o600);
    }
    let mut file = options.open(&temp).map_err(|error| error.to_string())?;
    let saved = file
        .write_all(body.as_bytes())
        .and_then(|_| file.sync_all());
    drop(file);
    let saved = saved.and_then(|_| fs::rename(&temp, path));
    if let Err(error) = saved {
        return match fs::remove_file(&temp) {
            Ok(()) => Err(error.to_string()),
            Err(cleanup) => Err(format!(
                "{error}; handoff temporary-file cleanup failed: {cleanup}"
            )),
        };
    }
    #[cfg(unix)]
    fs::File::open(parent)
        .and_then(|file| file.sync_all())
        .map_err(|error| error.to_string())?;
    Ok(())
}

pub(super) fn prepare(
    root: &Path,
    inputs: &[HandoffInput],
) -> Result<Vec<ManifestReference>, String> {
    if !root.is_absolute() || !root.is_dir() {
        return Err("Card worktree is missing.".into());
    }
    for input in inputs {
        if !KINDS.contains(&input.kind.as_str())
            || input.version <= 0
            || input.body.trim().is_empty()
            || input.body.len() > MAX_BODY
        {
            return Err("Invalid handoff artifact kind, version or body.".into());
        }
    }
    let tracked =
        crate::git::git_bytes(root, &["ls-files", "--cached", "-z", "--", ".molfar/board"])?;
    if !tracked.is_empty() {
        return Err("Tracked Board handoff files were preserved; preparation requires an untracked handoff folder.".into());
    }
    let parent = root.join(".molfar");
    let dir = parent.join("board");
    directory(&parent)?;
    directory(&dir)?;
    let ignore = dir.join(".gitignore");
    if target(&ignore)? {
        if fs::read_to_string(&ignore).map_err(|error| error.to_string())? != IGNORE {
            return Err("Existing Board handoff ignore file was preserved; expected the engine's ignore-all rule.".into());
        }
    } else {
        write(&ignore, IGNORE)?;
    }
    let mut files = Vec::new();
    for input in inputs {
        let name = format!("{}-v{}.md", input.kind, input.version);
        write(&dir.join(&name), &input.body)?;
        let path = format!(".molfar/board/{name}");
        crate::git::git(
            root,
            &["check-ignore", "--no-index", "--quiet", "--", &path],
        )
        .map_err(|error| format!("Handoff file is not safely ignored: {error}"))?;
        files.push(ManifestReference {
            kind: input.kind.clone(),
            version: input.version,
            path,
        });
    }
    Ok(files)
}
