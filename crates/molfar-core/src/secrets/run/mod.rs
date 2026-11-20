use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::{
    collections::HashSet,
    path::{Path, PathBuf},
};

use super::{Scope, SecretName, SecretStore, Store};

mod exec;
#[cfg(test)]
mod tests;
mod validate;

pub use exec::{Cancellation, Prepared};
pub use validate::env as validate_env;

pub const ACTION: &str = "run";
const MAX_SECRETS: usize = 16;
const DEFAULT_TIMEOUT_SECS: u64 = 120;
const MAX_TIMEOUT_SECS: u64 = 600;
const OUTPUT_LIMIT: usize = 256 * 1024;

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Request {
    argv: Vec<String>,
    #[serde(default)]
    secrets: Vec<Injection>,
    cwd: Option<PathBuf>,
    timeout_secs: Option<u64>,
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct Injection {
    name: SecretName,
    env: SecretName,
}

impl Request {
    pub fn parse(value: &Value) -> Result<Self, String> {
        let request: Self =
            serde_json::from_value(value.clone()).map_err(|_| "Invalid app run input.")?;
        if !(1..=256).contains(&request.argv.len())
            || request.argv[0].is_empty()
            || request
                .argv
                .iter()
                .any(|argument| argument.len() > 32 * 1024 || argument.contains('\0'))
        {
            return Err("Provide 1–256 arguments, each at most 32 KiB.".into());
        }
        if !(1..=MAX_TIMEOUT_SECS).contains(&request.timeout_secs()) {
            return Err("Timeout must be 1–600 seconds.".into());
        }
        if request.secrets.len() > MAX_SECRETS {
            return Err("At most 16 secrets can be injected.".into());
        }

        let mut seen = HashSet::new();
        for injection in &request.secrets {
            validate_env(&injection.env)?;
            if !seen.insert(injection.env.as_str()) {
                return Err("Duplicate environment variable.".into());
            }
        }
        Ok(request)
    }

    pub fn timeout_secs(&self) -> u64 {
        self.timeout_secs.unwrap_or(DEFAULT_TIMEOUT_SECS)
    }
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Outcome {
    pub exit_code: Option<i32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub signal: Option<i32>,
    pub timed_out: bool,
    pub duration_ms: u128,
    pub stdout: String,
    pub stderr: String,
    pub truncated: bool,
    pub secrets: Vec<SecretName>,
    #[serde(skip)]
    pub cwd: PathBuf,
}

impl Outcome {
    pub fn receipt(&self) -> Value {
        json!({
            "exitCode": self.exit_code, "signal": self.signal, "timedOut": self.timed_out,
            "durationMs": self.duration_ms, "cwd": self.cwd, "secrets": self.secrets, "outputExpired": true,
        })
    }
}

pub fn prepare(
    store: &SecretStore,
    db: &Store,
    scope: Option<Scope>,
    roots: &[PathBuf],
    request: Request,
) -> Result<Prepared, String> {
    let cwd = validate::cwd(request.cwd.as_deref(), roots)?;
    let names: Vec<_> = request
        .secrets
        .iter()
        .map(|item| item.name.clone())
        .collect();
    let scopes: Vec<_> = super::scopes_for(scope.clone()).collect();
    let values = store.resolve_names(db, &scopes, &names)?;
    let redactor = store
        .redactor(db, scope)
        .map_err(|error| error.to_string())?;
    let redactor = redactor.with_values(names.iter().cloned().zip(values.iter().cloned()));
    Ok(Prepared {
        request,
        cwd,
        names,
        values,
        redactor,
    })
}
