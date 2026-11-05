//! Machine load for the Home Host widget, ported from src-tauri/home_host.rs
//! without its sysinfo dependency.

pub fn machine_name() -> Option<String> {
    hostname::get()
        .ok()
        .map(|name| name.to_string_lossy().into_owned())
        .filter(|name| !name.is_empty())
}

#[derive(Clone, Copy, Debug, Default, PartialEq)]
pub struct HostStats {
    pub cpu_percent: Option<f32>,
    pub memory_percent: f32,
    pub swap_percent: f32,
    pub load_average: Option<f64>,
    pub cpu_count: usize,
    pub process_count: Option<usize>,
}

#[derive(Clone, Copy, Debug, Default)]
struct Raw {
    used_memory: u64,
    total_memory: u64,
    used_swap: u64,
    total_swap: u64,
}

/// CPU usage is a delta between two reads, so one sampler must live across polls.
#[derive(Default)]
pub struct Sampler {
    previous: Option<platform::Ticks>,
}

impl Sampler {
    pub fn sample(&mut self) -> Result<HostStats, String> {
        let ticks = platform::cpu_ticks();
        let cpu_percent = match (self.previous, ticks) {
            (Some(before), Some(now)) => platform::cpu_percent(before, now),
            _ => None,
        };
        self.previous = ticks.or(self.previous);
        let raw = platform::memory()?;

        Ok(HostStats {
            cpu_percent: cpu_percent.map(|value| value.clamp(0., 100.)),
            memory_percent: percent(raw.used_memory, raw.total_memory),
            swap_percent: percent(raw.used_swap, raw.total_swap),
            load_average: load_average(),
            cpu_count: std::thread::available_parallelism().map_or(1, usize::from),
            process_count: platform::process_count(),
        })
    }
}

fn percent(used: u64, total: u64) -> f32 {
    if total == 0 {
        return 0.;
    }
    ((used as f64 / total as f64) * 100.).clamp(0., 100.) as f32
}

#[cfg(unix)]
fn load_average() -> Option<f64> {
    let mut loads = [0f64; 3];
    let read = unsafe { libc::getloadavg(loads.as_mut_ptr(), 3) };
    (read >= 1).then_some(loads[0])
}

#[cfg(not(unix))]
fn load_average() -> Option<f64> {
    None
}

#[cfg(target_os = "macos")]
#[path = "host/macos.rs"]
mod platform;

#[cfg(target_os = "linux")]
#[path = "host/linux.rs"]
mod platform;

#[cfg(not(any(target_os = "macos", target_os = "linux")))]
mod platform {
    use super::Raw;

    pub(super) type Ticks = ();

    pub(super) fn cpu_ticks() -> Option<Ticks> {
        None
    }

    pub(super) fn cpu_percent(_: Ticks, _: Ticks) -> Option<f32> {
        None
    }

    pub(super) fn memory() -> Result<Raw, String> {
        Err("Host stats are not available on this platform".into())
    }

    pub(super) fn process_count() -> Option<usize> {
        None
    }
}

#[cfg(test)]
mod tests {
    use super::percent;
    #[cfg(any(target_os = "macos", target_os = "linux"))]
    use super::Sampler;

    #[test]
    fn percentages_clamp_and_survive_empty_totals() {
        assert_eq!(percent(6, 8), 75.);
        assert_eq!(percent(1, 0), 0.);
        assert_eq!(percent(9, 8), 100.);
    }

    #[cfg(any(target_os = "macos", target_os = "linux"))]
    #[test]
    fn a_second_sample_reports_cpu_and_sane_memory() {
        let mut sampler = Sampler::default();
        let first = sampler.sample().unwrap();
        assert!(first.cpu_percent.is_none());
        std::thread::sleep(std::time::Duration::from_millis(60));

        let second = sampler.sample().unwrap();

        assert!(second
            .cpu_percent
            .is_some_and(|cpu| (0. ..=100.).contains(&cpu)));
        assert!((0. ..=100.).contains(&second.memory_percent));
        assert!(second.memory_percent > 0.);
        assert!(second.cpu_count >= 1);
        assert!(second.process_count.is_some_and(|count| count > 0));
    }
}
