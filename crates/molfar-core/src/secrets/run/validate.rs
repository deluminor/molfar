use std::path::{Path, PathBuf};

use super::SecretName;

pub fn env(name: &SecretName) -> Result<(), String> {
    let name = name.as_str();
    if ["PATH", "HOME", "USER", "SHELL"].contains(&name)
        || ["MOLFAR_", "LD_", "DYLD_"]
            .iter()
            .any(|prefix| name.starts_with(prefix))
    {
        return Err("Reserved environment variable name.".into());
    }
    Ok(())
}

pub(super) fn cwd(requested: Option<&Path>, roots: &[PathBuf]) -> Result<PathBuf, String> {
    let default = roots.first().ok_or("app run needs an assigned project")?;
    let candidate = match requested {
        None => default.clone(),
        Some(path) if path.is_absolute() => path.to_owned(),
        Some(path) => default.join(path),
    };
    let candidate = candidate
        .canonicalize()
        .map_err(|_| "Run directory unavailable.")?;
    if !candidate.is_dir()
        || !roots
            .iter()
            .filter_map(|root| root.canonicalize().ok())
            .any(|root| candidate.starts_with(root))
    {
        return Err(
            "Run directory must be inside the session worktree or an assigned project.".into(),
        );
    }
    Ok(candidate)
}
