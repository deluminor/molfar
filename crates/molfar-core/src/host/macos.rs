use super::Raw;

pub(super) type Ticks = [u32; 4];

unsafe extern "C" {
    fn mach_host_self() -> u32;
}

pub(super) fn cpu_ticks() -> Option<Ticks> {
    let mut ticks = [0u32; 4];
    let mut count = 4;
    let ok = unsafe {
        libc::host_statistics(
            mach_host_self(),
            libc::HOST_CPU_LOAD_INFO,
            ticks.as_mut_ptr() as *mut i32,
            &mut count,
        )
    } == 0;
    ok.then_some(ticks)
}

pub(super) fn cpu_percent(before: Ticks, now: Ticks) -> Option<f32> {
    let delta: Vec<u64> = now
        .iter()
        .zip(before)
        .map(|(now, old)| u64::from(now.wrapping_sub(old)))
        .collect();
    let total: u64 = delta.iter().sum();
    let idle = delta[libc::CPU_STATE_IDLE as usize];
    (total > 0).then(|| (100. * (total - idle) as f64 / total as f64) as f32)
}

/// `T` must be plain data that the named sysctl fills completely.
fn sysctl<T: Copy>(name: &std::ffi::CStr) -> Option<T> {
    let mut value: T = unsafe { std::mem::zeroed() };
    let mut length = std::mem::size_of::<T>();
    let ok = unsafe {
        libc::sysctlbyname(
            name.as_ptr(),
            &mut value as *mut T as *mut _,
            &mut length,
            std::ptr::null_mut(),
            0,
        )
    } == 0;
    ok.then_some(value)
}

pub(super) fn memory() -> Result<Raw, String> {
    let total_memory: u64 = sysctl(c"hw.memsize").ok_or("Could not read installed memory")?;
    let mut stats: libc::vm_statistics64 = unsafe { std::mem::zeroed() };
    let mut count = libc::HOST_VM_INFO64_COUNT;
    let ok = unsafe {
        libc::host_statistics64(
            mach_host_self(),
            libc::HOST_VM_INFO64,
            &mut stats as *mut _ as *mut i32,
            &mut count,
        )
    } == 0;
    if !ok {
        return Err("Could not read memory statistics".into());
    }
    let page = unsafe { libc::vm_page_size } as u64;
    let used_pages = u64::from(stats.active_count)
        + u64::from(stats.wire_count)
        + u64::from(stats.compressor_page_count);
    let swap = sysctl::<libc::xsw_usage>(c"vm.swapusage");

    Ok(Raw {
        used_memory: (used_pages * page).min(total_memory),
        total_memory,
        used_swap: swap.map_or(0, |swap| swap.xsu_used),
        total_swap: swap.map_or(0, |swap| swap.xsu_total),
    })
}

pub(super) fn process_count() -> Option<usize> {
    let count = unsafe { libc::proc_listallpids(std::ptr::null_mut(), 0) };
    usize::try_from(count).ok().filter(|count| *count > 0)
}
