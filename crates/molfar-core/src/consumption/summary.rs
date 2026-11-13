use super::{
    pricing::{self, Cost},
    types::{TokenCounts, UsageRecord},
};

/// How much of a projection the ledger can account for.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Reporting {
    Empty,
    NotReported,
    Partial,
    Complete,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Pricing {
    Unavailable,
    Partial,
    Complete,
}

/// A checked roll-up of ledger records; tokens are normalized (input excludes cache).
#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
pub struct UsageSummary {
    pub tokens: TokenCounts,
    pub reported_runs: usize,
    pub unreported_runs: usize,
    pub priced_runs: usize,
    pub cost: Cost,
}

impl UsageSummary {
    pub fn of<'a>(records: impl IntoIterator<Item = &'a UsageRecord>) -> Result<Self, String> {
        let mut summary = Self::default();
        for record in records {
            summary.add(record)?;
        }

        Ok(summary)
    }

    pub fn add(&mut self, record: &UsageRecord) -> Result<(), String> {
        let overflow = || format!("Usage total overflows at source={}", record.source_key);
        let Some(tokens) = pricing::normalized(record) else {
            self.unreported_runs += 1;
            return Ok(());
        };

        self.tokens = self.tokens.checked_add(tokens).ok_or_else(overflow)?;
        self.tokens.total().ok_or_else(overflow)?;
        self.reported_runs += 1;
        if let Some(cost) = pricing::cost(record) {
            self.cost = self.cost.checked_add(cost).ok_or_else(overflow)?;
            self.priced_runs += 1;
        }

        Ok(())
    }

    pub fn merge(&mut self, other: &Self) -> Result<(), String> {
        let overflow = || "Usage total overflows while merging".to_owned();
        self.tokens = self.tokens.checked_add(other.tokens).ok_or_else(overflow)?;
        self.tokens.total().ok_or_else(overflow)?;
        self.cost = self.cost.checked_add(other.cost).ok_or_else(overflow)?;
        self.reported_runs += other.reported_runs;
        self.unreported_runs += other.unreported_runs;
        self.priced_runs += other.priced_runs;

        Ok(())
    }

    pub fn total_tokens(&self) -> u64 {
        self.tokens.total().unwrap_or(u64::MAX)
    }

    pub fn reporting(&self) -> Reporting {
        match (self.reported_runs, self.unreported_runs) {
            (0, 0) => Reporting::Empty,
            (0, _) => Reporting::NotReported,
            (_, 0) => Reporting::Complete,
            _ => Reporting::Partial,
        }
    }

    /// The known cost is a subtotal whenever any reported run could not be priced.
    pub fn pricing(&self) -> Pricing {
        match self.priced_runs {
            0 => Pricing::Unavailable,
            priced if priced == self.reported_runs => Pricing::Complete,
            _ => Pricing::Partial,
        }
    }
}
