use super::*;

pub(super) fn read_store(path: &Path) -> Stored {
    let Ok(bytes) = fs::read(path) else {
        return Stored::default();
    };
    match serde_json::from_slice::<Stored>(&bytes) {
        Ok(stored) => stored,
        Err(error) => {
            eprintln!(
                "molfar: companion store at {} is corrupt ({error}); backing up and resetting",
                path.display()
            );
            let _ = fs::rename(path, path.with_extension("json.corrupt"));
            Stored::default()
        }
    }
}

pub(super) fn write_store(path: &Path, stored: &Stored) -> Result<(), String> {
    let parent = path.parent().ok_or("Missing companion directory")?;
    fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    let temporary = parent.join(format!("companion-{}.tmp", uuid::Uuid::new_v4()));
    let result = (|| -> Result<(), String> {
        let mut options = fs::OpenOptions::new();
        options.write(true).create_new(true);
        #[cfg(unix)]
        {
            use std::os::unix::fs::OpenOptionsExt;
            options.mode(0o600);
        }
        let mut file = options.open(&temporary).map_err(|e| e.to_string())?;
        file.write_all(&serde_json::to_vec_pretty(stored).map_err(|e| e.to_string())?)
            .map_err(|e| e.to_string())?;
        file.sync_all().map_err(|e| e.to_string())?;
        fs::rename(&temporary, path).map_err(|e| e.to_string())
    })();
    if result.is_err() {
        let _ = fs::remove_file(&temporary);
    }
    result
}
