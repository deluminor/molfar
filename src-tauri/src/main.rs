#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    if let Some(code) = molfar_lib::ssh_askpass::maybe_run() {
        std::process::exit(code);
    }
    if std::env::args().nth(1).as_deref() == Some("control") {
        std::process::exit(molfar_lib::control_cli::run(
            std::env::args().skip(2).collect(),
        ));
    }
    if std::env::args().nth(1).as_deref() == Some("app") {
        std::process::exit(molfar_lib::control_cli::run_app(
            std::env::args().skip(2).collect(),
        ));
    }
    if std::env::args().nth(1).as_deref() == Some("connectors-mcp") {
        std::process::exit(molfar_lib::connectors_mcp::run());
    }
    #[cfg(all(debug_assertions, target_os = "macos"))]
    molfar_lib::ensure_macos_dev_bundle();
    molfar_lib::run()
}
