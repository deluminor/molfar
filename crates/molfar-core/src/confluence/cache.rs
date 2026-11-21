use std::{
    fs,
    io::Write,
    path::{Path, PathBuf},
    time::Duration,
};

use serde::{de::DeserializeOwned, Serialize};
use sha2::{Digest, Sha256};

pub struct Cache(Option<PathBuf>);

impl Cache {
    pub fn new(data_dir: Option<&Path>, account: &str) -> Self {
        Self(data_dir.map(|dir| dir.join("confluence-cache").join(hash(account))))
    }

    pub fn read<T: DeserializeOwned>(
        &self,
        group: &str,
        key: &str,
        ttl: Option<Duration>,
    ) -> Option<T> {
        let path = self.path(group, key)?;
        if let Some(ttl) = ttl {
            let age = fs::metadata(&path).ok()?.modified().ok()?.elapsed().ok()?;
            if age > ttl {
                return None;
            }
        }

        serde_json::from_slice(&fs::read(path).ok()?).ok()
    }

    pub fn write(&self, group: &str, key: &str, value: &impl Serialize) -> std::io::Result<()> {
        if let Some(path) = self.path(group, key) {
            write_atomic(&path, &serde_json::to_vec(value)?)?;
        }

        Ok(())
    }

    pub fn image_path(&self, key: &str) -> Option<PathBuf> {
        self.path("images", key)
            .map(|path| path.with_extension("png"))
    }

    pub fn write_image(&self, key: &str, bytes: &[u8]) -> std::io::Result<Option<PathBuf>> {
        let path = self.image_path(key);
        if let Some(path) = &path {
            write_atomic(path, bytes)?;
        }

        Ok(path)
    }

    fn path(&self, group: &str, key: &str) -> Option<PathBuf> {
        self.0.as_ref().map(|root| root.join(group).join(hash(key)))
    }
}

fn hash(text: &str) -> String {
    format!("{:x}", Sha256::digest(text.as_bytes()))
}

fn write_atomic(path: &Path, bytes: &[u8]) -> std::io::Result<()> {
    let directory = path.parent().ok_or(std::io::ErrorKind::InvalidInput)?;
    fs::create_dir_all(directory)?;
    let mut file = tempfile::NamedTempFile::new_in(directory)?;
    file.write_all(bytes)?;
    file.persist(path)?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn confluence_cache_isolated_by_account_and_handles_untrusted_keys() {
        let root = tempfile::tempdir().unwrap();
        let cache = Cache::new(Some(root.path()), "account-a");
        let key = "../opaque-id:4";
        cache.write("pages", key, &"cached document").unwrap();
        assert_eq!(
            cache.read::<String>("pages", key, None).as_deref(),
            Some("cached document")
        );
        assert_eq!(
            Cache::new(Some(root.path()), "account-b").read::<String>("pages", key, None),
            None
        );
    }
}
