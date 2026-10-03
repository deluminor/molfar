use std::ffi::OsStr;

use sysinfo::{ProcessRefreshKind, ProcessesToUpdate, System};

/// Executable names MonoCode shipped under: the bundle's product name on
/// macOS/Windows and the Cargo package name on Linux.
const LEGACY_PROCESS_NAMES: [&str; 2] = ["monocode", "mono-code"];

pub(super) fn legacy_app_running() -> bool {
    let mut system = System::new();
    system.refresh_processes_specifics(ProcessesToUpdate::All, true, ProcessRefreshKind::nothing());

    system
        .processes()
        .values()
        .any(|process| is_legacy_process_name(process.name()))
}

pub(super) fn is_legacy_process_name(name: &OsStr) -> bool {
    let name = name.to_string_lossy().to_lowercase();
    let stem = name.strip_suffix(".exe").unwrap_or(&name);

    LEGACY_PROCESS_NAMES.contains(&stem)
}
