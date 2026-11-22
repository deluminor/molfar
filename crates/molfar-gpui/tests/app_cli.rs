use molfar_core::familiar::bridge::Server;
use serde_json::{Value, json};
use std::process::{Command, Output};

fn assert_response(output: Output, success: bool) -> Value {
    assert_eq!(output.status.success(), success);
    assert_eq!(output.status.code(), Some(i32::from(!success)));
    let response: Value = serde_json::from_slice(&output.stdout).unwrap();
    assert_eq!(response["ok"], success);
    response
}

#[test]
fn app_cli_uses_the_envelope_status_for_every_action() {
    let (bridge, calls) = Server::start().unwrap();
    for (action, args, result) in [
        ("secrets.list", vec!["secrets.list"], json!([])),
        (
            "models.list",
            vec!["models.list"],
            json!({"ok": false, "models": []}),
        ),
        (
            "run",
            vec!["run", "--", "echo", "fixture"],
            json!({"exitCode": 0, "timedOut": false}),
        ),
    ] {
        for success in [false, true] {
            let calls = calls.clone();
            let result = result.clone();
            let responder = std::thread::spawn(move || {
                let call = calls.recv_blocking().unwrap();
                assert_eq!(call.action, action);
                call.reply
                    .send(if success {
                        Ok(result)
                    } else {
                        Err("Operator is not enabled for this thread.".into())
                    })
                    .unwrap();
            });
            let output = Command::new(env!("CARGO_BIN_EXE_molfar-native"))
                .arg("app")
                .args(&args)
                .envs(bridge.environment(1))
                .output()
                .unwrap();
            responder.join().unwrap();
            let response = assert_response(output, success);
            if !success {
                assert_eq!(
                    response["error"],
                    "Operator is not enabled for this thread."
                );
            }
        }
    }
}

#[test]
fn app_cli_reports_argument_and_transport_errors_as_json() {
    for args in [["models.list", "--json"], ["models.list", "{}"]] {
        let output = Command::new(env!("CARGO_BIN_EXE_molfar-native"))
            .arg("app")
            .args(args)
            .env_remove("MOLFAR_APP_ENDPOINT")
            .output()
            .unwrap();
        assert!(assert_response(output, false)["error"].is_string());
    }
}
