use std::path::{Component, Path, PathBuf};

pub fn validate_root(path: &Path) -> Result<PathBuf, String> {
    let absolute = if path.is_absolute() {
        path.to_path_buf()
    } else {
        std::env::current_dir()
            .map_err(|error| error.to_string())?
            .join(path)
    };
    reject_symlinks(&absolute)?;

    let root = absolute
        .canonicalize()
        .map_err(|error| format!("Cannot open vault: {error}"))?;
    if !root.is_dir() {
        return Err("Vault path must be a directory.".into());
    }

    Ok(root)
}

fn reject_symlinks(path: &Path) -> Result<(), String> {
    let mut current = PathBuf::new();
    for component in path.components() {
        if component == Component::ParentDir {
            return Err("Parent traversal is not permitted.".into());
        }
        current.push(component);
        let metadata = std::fs::symlink_metadata(&current)
            .map_err(|error| format!("{}: {error}", current.display()))?;
        if metadata.file_type().is_symlink() {
            return Err("Symbolic links are not permitted in vault paths.".into());
        }
    }

    Ok(())
}

pub fn resolve(root: &Path, relative: &str) -> Result<PathBuf, String> {
    if relative.is_empty() || relative.contains('\\') {
        return Err("An unambiguous vault-relative path is required.".into());
    }
    let input = Path::new(relative);
    for component in input.components() {
        match component {
            Component::Normal(name) if !name.to_string_lossy().starts_with('.') => {}
            _ => return Err("Path is outside the visible vault.".into()),
        }
    }

    let destination = root.join(input);
    reject_symlinks(&destination)?;
    let canonical = destination
        .canonicalize()
        .map_err(|error| error.to_string())?;
    if !canonical.starts_with(root) {
        return Err("Path is outside the connected vault.".into());
    }

    Ok(canonical)
}

pub fn is_markdown(path: &Path) -> bool {
    path.extension().is_some_and(|extension| {
        extension.eq_ignore_ascii_case("md") || extension.eq_ignore_ascii_case("markdown")
    })
}

pub fn validate_connection_id(id: &str) -> Result<(), String> {
    let parsed =
        uuid::Uuid::parse_str(id).map_err(|_| "Invalid saved vault connection ID.".to_string())?;
    if parsed.to_string() != id {
        return Err("Vault connection ID must be a canonical UUID.".into());
    }

    Ok(())
}
