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

pub(super) fn store_stamp(path: &Path) -> Option<SystemTime> {
    fs::metadata(path).and_then(|meta| meta.modified()).ok()
}

/// The desktop app rewrites this shared file, so a stale copy would keep
/// honoring revoked tokens and restore them on its next write.
pub(super) fn sync_store(inner: &mut Inner) {
    let stamp = store_stamp(&inner.path);
    if stamp.is_none() || stamp == inner.store_stamp {
        return;
    }
    inner.store_stamp = stamp;

    let parsed = fs::read(&inner.path)
        .map_err(|error| error.to_string())
        .and_then(|bytes| {
            serde_json::from_slice::<Stored>(&bytes).map_err(|error| error.to_string())
        });
    let mut disk = match parsed {
        Ok(disk) => disk,
        Err(error) => {
            eprintln!("molfar: could not reload the Companion store: {error}");
            return;
        }
    };

    for device in &mut disk.devices {
        let known = inner
            .stored
            .devices
            .iter()
            .find(|known| known.id == device.id);
        if let Some(known) = known {
            device.last_seen_at = device.last_seen_at.max(known.last_seen_at);
        }
    }
    inner.stored = disk;
}

pub(super) fn persist(inner: &mut Inner) -> Result<(), String> {
    write_store(&inner.path, &inner.stored)?;
    inner.store_stamp = store_stamp(&inner.path);
    Ok(())
}

fn write_store(path: &Path, stored: &Stored) -> Result<(), String> {
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
