use super::*;
use std::path::PathBuf;

pub struct Fixture(pub PathBuf);

impl Fixture {
    pub fn new() -> Self {
        let root = std::env::temp_dir()
            .canonicalize()
            .unwrap()
            .join(format!("molfar-vault-test-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir(&root).unwrap();
        Self(root)
    }

    pub fn connection(&self) -> VaultConnection {
        VaultConnection {
            id: "fixture".into(),
            root: self.0.to_string_lossy().into_owned(),
            name: "Fixture".into(),
        }
    }

    pub fn write(&self, path: &str, body: &str) {
        let destination = self.0.join(path);
        std::fs::create_dir_all(destination.parent().unwrap()).unwrap();
        std::fs::write(destination, body).unwrap();
    }

    pub fn write_bytes(&self, path: &str, body: &[u8]) {
        let destination = self.0.join(path);
        std::fs::create_dir_all(destination.parent().unwrap()).unwrap();
        std::fs::write(destination, body).unwrap();
    }
}

impl Drop for Fixture {
    fn drop(&mut self) {
        if let Err(error) = std::fs::remove_dir_all(&self.0) {
            eprintln!("vault test cleanup: {error}");
        }
    }
}

mod companion;
mod connection;
mod documents;
mod links;
mod parse;
mod paths;
mod preview;
mod scan;
