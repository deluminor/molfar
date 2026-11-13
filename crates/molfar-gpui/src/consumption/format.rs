use molfar_core::consumption::{
    prices::PRICE_TABLE_VERSION,
    pricing::Cost,
    summary::{Pricing, Reporting, UsageSummary},
};

const MONTHS: [&str; 12] = [
    "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];
const CENT: f64 = 0.01;
const WHOLE_DOLLARS_FROM: f64 = 100.;

pub(crate) fn tokens(count: u64) -> String {
    molfar_core::context::format_tokens(count)
}

/// `$0.42`, `<$0.01`, `$1,234`: cents below a hundred dollars, whole dollars above.
pub(crate) fn usd(cost: Cost) -> String {
    let amount = cost.usd();
    if amount > 0. && amount < CENT {
        return "<$0.01".into();
    }
    if amount < WHOLE_DOLLARS_FROM {
        return format!("${amount:.2}");
    }

    let digits = format!("{:.0}", amount.round());
    let mut grouped = String::with_capacity(digits.len() + digits.len() / 3);
    for (index, digit) in digits.chars().enumerate() {
        if index > 0 && (digits.len() - index).is_multiple_of(3) {
            grouped.push(',');
        }
        grouped.push(digit);
    }
    format!("${grouped}")
}

/// `~$3.40` for a full estimate, `~$3.40+` for a known subtotal, `None` when unavailable.
pub(crate) fn estimate(summary: &UsageSummary) -> Option<String> {
    match summary.pricing() {
        Pricing::Unavailable => None,
        Pricing::Partial => Some(format!("~{}+", usd(summary.cost))),
        Pricing::Complete => Some(format!("~{}", usd(summary.cost))),
    }
}

/// `1.2M tokens · ~$3.40`, or the reporting state when there is nothing to total.
pub(crate) fn headline(summary: &UsageSummary) -> String {
    match summary.reporting() {
        Reporting::Empty => "No usage yet".into(),
        Reporting::NotReported => "Usage not reported".into(),
        Reporting::Partial | Reporting::Complete => {
            let tokens = format!("{} tokens", tokens(summary.total_tokens()));
            match estimate(summary) {
                Some(cost) => format!("{tokens} · {cost}"),
                None => tokens,
            }
        }
    }
}

/// Why a total is incomplete, in the order a reader needs it.
pub(crate) fn caveats(summary: &UsageSummary) -> Vec<String> {
    let mut notes = Vec::new();
    if summary.reporting() == Reporting::Partial {
        notes.push(format!(
            "Partial · {} of {} runs reported usage",
            summary.reported_runs,
            summary.reported_runs + summary.unreported_runs
        ));
    }
    let has_tokens = matches!(
        summary.reporting(),
        Reporting::Partial | Reporting::Complete
    );
    match summary.pricing() {
        Pricing::Unavailable if has_tokens => {
            notes.push("Cost unavailable for these models".into())
        }
        Pricing::Partial => notes.push(format!(
            "Known subtotal · {} of {} runs priced",
            summary.priced_runs, summary.reported_runs
        )),
        _ => {}
    }

    notes
}

/// `input 12K · output 3.4K · cache read 1.2M · cache write 80K`, skipping zero categories.
pub(crate) fn breakdown(summary: &UsageSummary) -> String {
    let tokens = summary.tokens;
    [
        (tokens.input, "input"),
        (tokens.output, "output"),
        (tokens.cache_read, "cache read"),
        (tokens.cache_write, "cache write"),
    ]
    .into_iter()
    .filter(|(count, _)| *count > 0)
    .map(|(count, label)| format!("{label} {}", self::tokens(count)))
    .collect::<Vec<_>>()
    .join(" · ")
}

/// `Estimate · prices as of 13 Nov 2026`.
pub(crate) fn footnote() -> String {
    let mut parts = PRICE_TABLE_VERSION.split('-');
    let (Some(year), Some(month), Some(day)) = (parts.next(), parts.next(), parts.next()) else {
        return format!("Estimate · prices {PRICE_TABLE_VERSION}");
    };
    let month = month
        .parse::<usize>()
        .ok()
        .and_then(|month| MONTHS.get(month.wrapping_sub(1)))
        .copied()
        .unwrap_or(month);

    format!(
        "Estimate · prices as of {} {month} {year}",
        day.trim_start_matches('0')
    )
}

#[cfg(test)]
#[path = "format_tests.rs"]
mod tests;
