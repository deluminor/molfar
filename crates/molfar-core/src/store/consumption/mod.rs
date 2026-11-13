mod read;
mod write;

#[cfg(test)]
mod tests;

pub(super) const LEDGER_TABLE: &str = "native_consumption_v1";
pub(super) const SCHEMA: &str = include_str!("schema.sql");
