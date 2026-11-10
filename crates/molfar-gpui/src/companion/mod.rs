//! BitChain Companion gateway. The phone still dials Tailscale; this process
//! answers on the same port and `companion.json` as the Tauri app.
mod discovery;
mod gateway;
mod http;
mod permit;
mod types;

pub(crate) use http::Job;
#[cfg(test)]
pub(crate) use permit::Permit;
pub(crate) use types::{Host, Offer, Status};
