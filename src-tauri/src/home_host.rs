use std::sync::{Mutex, OnceLock};

use serde::Serialize;
use sysinfo::{ProcessRefreshKind, ProcessesToUpdate, System};

#[derive(Debug, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct HostStats {
    pub cpu_percent: f32,
    pub memory_percent: f32,
    pub swap_percent: f32,
    /// 1-minute load average; `None` where the OS has no load average (Windows).
    pub load_average: Option<f64>,
    pub cpu_count: usize,
    pub process_count: usize,
}

struct Sample {
    cpu_percent: f32,
    used_memory: u64,
    total_memory: u64,
    used_swap: u64,
    total_swap: u64,
    load_one: f64,
    cpu_count: usize,
    process_count: usize,
}

// CPU usage is a delta between refreshes, so the same System must survive
// across polls; a fresh one per call would always report 0 %.
fn system() -> &'static Mutex<System> {
    static SYSTEM: OnceLock<Mutex<System>> = OnceLock::new();
    SYSTEM.get_or_init(|| {
        let mut system = System::new();
        system.refresh_cpu_usage();
        Mutex::new(system)
    })
}

fn percent(used: u64, total: u64) -> f32 {
    if total == 0 {
        0.0
    } else {
        ((used as f64 / total as f64) * 100.0) as f32
    }
}

fn to_stats(sample: Sample) -> HostStats {
    HostStats {
        cpu_percent: sample.cpu_percent.clamp(0.0, 100.0),
        memory_percent: percent(sample.used_memory, sample.total_memory).clamp(0.0, 100.0),
        swap_percent: percent(sample.used_swap, sample.total_swap).clamp(0.0, 100.0),
        load_average: if cfg!(windows) {
            None
        } else {
            Some(sample.load_one)
        },
        cpu_count: sample.cpu_count,
        process_count: sample.process_count,
    }
}

fn sample_host() -> Result<HostStats, String> {
    let mut system = system()
        .lock()
        .map_err(|_| "Host stats sampler is unavailable".to_string())?;
    system.refresh_cpu_usage();
    system.refresh_memory();
    system.refresh_processes_specifics(ProcessesToUpdate::All, true, ProcessRefreshKind::nothing());
    Ok(to_stats(Sample {
        cpu_percent: system.global_cpu_usage(),
        used_memory: system.used_memory(),
        total_memory: system.total_memory(),
        used_swap: system.used_swap(),
        total_swap: system.total_swap(),
        load_one: System::load_average().one,
        cpu_count: system.cpus().len(),
        process_count: system.processes().len(),
    }))
}

/// CPU, memory, swap, load, and process count for the Home host card.
#[tauri::command]
pub async fn home_host_stats() -> Result<HostStats, String> {
    tauri::async_runtime::spawn_blocking(sample_host)
        .await
        .map_err(|error| error.to_string())?
}

#[cfg(test)]
mod tests {
    use super::*;

    fn sample() -> Sample {
        Sample {
            cpu_percent: 21.5,
            used_memory: 6,
            total_memory: 8,
            used_swap: 1,
            total_swap: 4,
            load_one: 1.3,
            cpu_count: 10,
            process_count: 243,
        }
    }

    #[test]
    fn maps_memory_and_swap_to_percentages() {
        let stats = to_stats(sample());
        assert_eq!(stats.memory_percent, 75.0);
        assert_eq!(stats.swap_percent, 25.0);
        assert_eq!(stats.cpu_percent, 21.5);
        assert_eq!(stats.process_count, 243);
        assert_eq!(stats.cpu_count, 10);
    }

    #[test]
    fn empty_memory_totals_do_not_divide_by_zero() {
        let stats = to_stats(Sample {
            total_memory: 0,
            total_swap: 0,
            ..sample()
        });
        assert_eq!(stats.memory_percent, 0.0);
        assert_eq!(stats.swap_percent, 0.0);
    }

    #[test]
    fn clamps_out_of_range_cpu() {
        let stats = to_stats(Sample {
            cpu_percent: 104.0,
            ..sample()
        });
        assert_eq!(stats.cpu_percent, 100.0);
    }

    #[cfg(not(windows))]
    #[test]
    fn reports_load_average_on_unix() {
        assert_eq!(to_stats(sample()).load_average, Some(1.3));
    }

    #[test]
    fn samples_the_real_host() {
        let stats = sample_host().expect("host sample");
        assert!(stats.cpu_count > 0);
        assert!(stats.process_count > 0);
        assert!(stats.memory_percent > 0.0);
    }
}
