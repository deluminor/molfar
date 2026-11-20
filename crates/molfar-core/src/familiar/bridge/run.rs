use super::{call, envelope_id, json, Value};
use crate::secrets::run::{Request, ACTION};
use std::time::{Duration, Instant};

pub(super) const TIMEOUT: &str = "App request timed out; retry using the same request ID";

pub(super) fn client(args: &[String]) -> Result<Value, String> {
    let (input, id, timeout) = parse(args)?;
    let deadline = Instant::now() + Duration::from_secs(timeout + 65);
    loop {
        let result = call(ACTION.to_owned(), input.clone(), id.clone())?;
        if result["error"].as_str() != Some(TIMEOUT) || Instant::now() >= deadline {
            return Ok(result);
        }
    }
}

fn parse(args: &[String]) -> Result<(Value, String, u64), String> {
    let mut input = json!({"secrets":[]});
    let mut id = None;
    let (flags, argv) = args.split_at(
        args.iter()
            .position(|arg| arg == "--")
            .ok_or("app run requires -- before the command.")?,
    );
    let mut flags = flags.iter();
    while let Some(flag) = flags.next() {
        let value = flags.next().ok_or("Missing app run flag value.")?;
        match flag.as_str() {
            "--secret" => {
                let (name, env) = value.split_once('=').unwrap_or((value, value));
                input["secrets"]
                    .as_array_mut()
                    .unwrap()
                    .push(json!({"name":name,"env":env}));
            }
            "--cwd" => input["cwd"] = json!(value),
            "--timeout" => {
                input["timeoutSecs"] =
                    json!(value.parse::<u64>().map_err(|_| "Invalid timeout.")?)
            }
            "--request-id" => id = Some(value.to_owned()),
            _ => return Err("Unknown app run option.".into()),
        }
    }
    input["argv"] = json!(&argv[1..]);
    let request = Request::parse(&input)?;
    let id = envelope_id(id, &input);
    Ok((input, id, request.timeout_secs()))
}

#[test]
fn app_run_preserves_arguments_and_secret_aliases() {
    let args = [
        "--secret",
        "TOKEN=API_TOKEN",
        "--secret",
        "SECOND",
        "--timeout",
        "10",
        "--",
        "echo",
        "--flag",
        "a b",
    ]
    .map(str::to_owned);
    let (input, _, timeout) = parse(&args).unwrap();
    assert_eq!(input["argv"], json!(["echo", "--flag", "a b"]));
    assert_eq!(
        input["secrets"],
        json!([{"name":"TOKEN","env":"API_TOKEN"},{"name":"SECOND","env":"SECOND"}])
    );
    assert_eq!(timeout, 10);
    assert!(parse(&args[..5]).is_err());
}
