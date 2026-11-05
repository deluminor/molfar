use super::Raw;

pub(super) type Ticks = [u64; 2];

pub(super) fn cpu_ticks() -> Option<Ticks> {
    let stat = std::fs::read_to_string("/proc/stat").ok()?;
    let fields: Vec<u64> = stat
        .lines()
        .next()?
        .split_whitespace()
        .skip(1)
        .filter_map(|field| field.parse().ok())
        .collect();
    let idle = fields.get(3)? + fields.get(4).copied().unwrap_or(0);
    Some([fields.iter().sum(), idle])
}

pub(super) fn cpu_percent(before: Ticks, now: Ticks) -> Option<f32> {
    let total = now[0].saturating_sub(before[0]);
    let idle = now[1].saturating_sub(before[1]);
    (total > 0).then(|| (100. * total.saturating_sub(idle) as f64 / total as f64) as f32)
}

pub(super) fn memory() -> Result<Raw, String> {
    let info = std::fs::read_to_string("/proc/meminfo").map_err(|error| error.to_string())?;
    let field = |name: &str| {
        info.lines()
            .find(|line| line.starts_with(name))
            .and_then(|line| line.split_whitespace().nth(1)?.parse::<u64>().ok())
            .map_or(0, |kib| kib * 1024)
    };
    let total_memory = field("MemTotal:");
    let total_swap = field("SwapTotal:");
    Ok(Raw {
        used_memory: total_memory.saturating_sub(field("MemAvailable:")),
        total_memory,
        used_swap: total_swap.saturating_sub(field("SwapFree:")),
        total_swap,
    })
}

pub(super) fn process_count() -> Option<usize> {
    let entries = std::fs::read_dir("/proc").ok()?;
    Some(
        entries
            .filter_map(Result::ok)
            .filter(|entry| {
                entry
                    .file_name()
                    .to_string_lossy()
                    .bytes()
                    .all(|b| b.is_ascii_digit())
            })
            .count(),
    )
}
