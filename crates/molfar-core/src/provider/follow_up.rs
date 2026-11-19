//! The same mid-turn wire messages used by the React provider adapters.
use super::*;
use crate::follow_up::Message;

static STEER_SEQUENCE: std::sync::atomic::AtomicU64 = std::sync::atomic::AtomicU64::new(1);
const CLAUDE_STEER_GRACE: Duration = Duration::from_secs(10);

impl Kind {
    pub fn can_steer(self) -> bool {
        matches!(
            self,
            Self::Codex
                | Self::Claude
                | Self::Cursor
                | Self::Pi
                | Self::Omp
                | Self::Hermes
                | Self::OpenCode
        )
    }
}

impl Protocol {
    pub(super) fn ready(&self) -> bool {
        match self.request.kind {
            Kind::Codex => self.active_turn.is_some(),
            Kind::Claude | Kind::Pi | Kind::Omp => self.follow_up_ready,
            _ => self.acp_active_session().is_some(),
        }
    }
    pub(super) fn steer(
        &mut self,
        message: Message,
        stdin: &mut impl Write,
    ) -> Result<Vec<Event>, String> {
        if !self.request.kind.can_steer() || !self.ready() || self.done {
            return Ok(vec![Event::FollowUpFailed {
                id: message.id,
                error: "The provider is not ready for a follow-up. Resume the queue to retry."
                    .into(),
            }]);
        }
        let mut request = self.request.clone();
        request.settings.attachments = message.attachments.clone();
        request.prompt = super::commands::prepare_prompt(
            request.kind,
            message.prepared_prompt.as_deref().unwrap_or(&message.text),
            &request.cwd.to_string_lossy(),
            &message.attachments,
        )?;
        // A retained message can be retried after its acknowledgement deadline.
        // Never let a late reply from that attempt acknowledge the retry.
        let wire = format!(
            "native-steer-{}-{}",
            message.id,
            STEER_SEQUENCE.fetch_add(1, Ordering::Relaxed)
        );
        match request.kind {
            Kind::Codex => write_json(
                stdin,
                json!({"id":wire,"method":"turn/steer","params":{"threadId":self.request.provider_id,"expectedTurnId":self.active_turn,"input":request.codex_input()}}),
            )?,
            Kind::Claude => {
                let prompt = if request.settings.effort.as_deref() == Some("ultrathink") {
                    if request.prompt.is_empty() {
                        "Ultrathink:".into()
                    } else {
                        format!("Ultrathink:\n{}", request.prompt)
                    }
                } else {
                    request.prompt.clone()
                };
                write_json(
                    stdin,
                    json!({"type":"user","session_id":"","parent_tool_use_id":null,"message":{"role":"user","content":request.claude_content(&prompt)?}}),
                )?;
                self.text_key = None;
                self.claude_steered = true;
                if self.claude_result_seen {
                    self.hold_for_claude_steer();
                }
                return Ok(vec![Event::FollowUp(message)]);
            }
            Kind::Pi | Kind::Omp => {
                let mut command = json!({"id":wire,"type":"steer","message":request.prompt.trim()});
                let images = request.pi_images()?;
                if images.as_array().is_some_and(|images| !images.is_empty()) {
                    command["images"] = images;
                }
                // OMP routes slash commands through prompt even in flight.
                // A steer command would deliver the slash text as user prose.
                if request.kind == Kind::Omp && request.prompt.trim_start().starts_with('/') {
                    command["type"] = "prompt".into();
                    command["streamingBehavior"] = "steer".into();
                }
                write_json(stdin, command)?;
            }
            Kind::Cursor => {
                let params =
                    json!({"sessionId":self.acp_active_session(),"prompt":request.acp_content()?});
                // Match Cursor's adapter: retry the older notification name
                // only when writing the current one fails.
                if write_json(
                    stdin,
                    json!({"jsonrpc":"2.0","method":"session/steer","params":params}),
                )
                .is_err()
                {
                    write_json(
                        stdin,
                        json!({"jsonrpc":"2.0","method":"_session/steer","params":params}),
                    )?;
                }
                self.text_key = None;
                return Ok(vec![Event::FollowUp(message)]);
            }
            Kind::Hermes | Kind::OpenCode => write_json(
                stdin,
                json!({"jsonrpc":"2.0","id":wire,"method":"session/prompt","params":{"sessionId":self.acp_active_session(),"prompt":request.acp_content()?}}),
            )?,
            _ => unreachable!(),
        }
        self.steering.insert(wire, (message, Instant::now()));
        Ok(Vec::new())
    }
    /// Claude Code answers a user frame it could not fold into the running
    /// turn in a turn of its own right after `result`. Ending on that
    /// `result` would park the process before the steered message is answered.
    pub(super) fn hold_for_claude_steer(&mut self) -> bool {
        if !std::mem::take(&mut self.claude_steered) {
            return false;
        }
        let until = Instant::now() + CLAUDE_STEER_GRACE;
        self.claude_resume_at = Some(self.claude_resume_at.map_or(until, |at| at.max(until)));
        true
    }
    pub(super) fn steer_response(&mut self, value: &Value) -> Option<Vec<Event>> {
        let wire = value["id"].as_str()?;
        let error = value.get("error").filter(|error| !error.is_null());
        let response = if self.request.kind.is_pi() {
            value["type"] == "response"
        } else {
            value.get("result").is_some() || error.is_some()
        };
        if !response {
            return None;
        }
        // A timed-out request can answer later. It must never be interpreted as
        // a fatal error for the unrelated turn still running.
        if wire.starts_with("native-steer-") && !self.steering.contains_key(wire) {
            return Some(Vec::new());
        }
        let (message, _) = self.steering.remove(wire)?;
        if error.is_some() || (self.request.kind.is_pi() && value["success"] != true) {
            let error = value["error"]["message"]
                .as_str()
                .or_else(|| value["error"].as_str())
                .unwrap_or("The provider could not accept this follow-up");
            Some(vec![Event::FollowUpFailed {
                id: message.id,
                error: error.into(),
            }])
        } else {
            self.text_key = None;
            Some(vec![Event::FollowUp(message)])
        }
    }
    pub(super) fn expire_steering(&mut self) -> Vec<Event> {
        // These are acknowledgement deadlines, not turn deadlines. Codex's
        // JSON-RPC steer request deliberately waits without a response timer.
        let timeout = match self.request.kind {
            Kind::Pi | Kind::Omp => Duration::from_secs(15),
            Kind::Hermes => Duration::from_secs(20),
            Kind::OpenCode => Duration::from_secs(30),
            _ => return Vec::new(),
        };
        let expired: Vec<_> = self
            .steering
            .iter()
            .filter(|(_, (_, at))| at.elapsed() > timeout)
            .map(|(id, _)| id.clone())
            .collect();
        expired
            .into_iter()
            .filter_map(|id| self.steering.remove(&id))
            .map(|(message, _)| Event::FollowUpFailed {
                id: message.id,
                error: "Timed out waiting for the provider to accept this follow-up".into(),
            })
            .collect()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    fn protocol(kind: Kind) -> Protocol {
        let mut p = Protocol::new(Request {
            kind,
            binary: "unused".into(),
            cwd: "/tmp".into(),
            prompt: "hello".into(),
            provider_id: Some("thread".into()),
            model: None,
            settings: Default::default(),
        });
        p.active_turn = Some("turn".into());
        p.follow_up_ready = true;
        p
    }
    #[test]
    fn codex_keeps_messages_until_ack_and_rejection_does_not_end_the_turn() {
        let mut p = protocol(Kind::Codex);
        let message = Message {
            id: "one".into(),
            text: "new direction 🙂".into(),
            ..Default::default()
        };
        let mut out = Vec::new();
        assert!(p.steer(message.clone(), &mut out).unwrap().is_empty());
        let wire: Value = serde_json::from_slice(&out).unwrap();
        assert_eq!(wire["method"], "turn/steer");
        assert_eq!(wire["params"]["expectedTurnId"], "turn");
        assert_eq!(wire["params"]["input"][0]["text"], message.text);
        let events = p
            .frame(
                json!({"id":wire["id"],"error":{"message":"turn is closing"}}),
                &mut out,
            )
            .unwrap();
        assert!(
            matches!(&events[0], Event::FollowUpFailed { id, error } if id == "one" && error == "turn is closing")
        );
        assert!(!p.done);
        out.clear();
        p.steer(message.clone(), &mut out).unwrap();
        let retry: Value = serde_json::from_slice(&out).unwrap();
        assert_ne!(retry["id"], wire["id"]);
        assert!(p
            .frame(json!({"id":wire["id"],"result":{}}), &mut out)
            .unwrap()
            .is_empty());
        assert_eq!(
            p.frame(json!({"id":retry["id"],"result":{}}), &mut out)
                .unwrap(),
            vec![Event::FollowUp(message)]
        );
    }
    #[test]
    fn claude_and_pi_use_their_existing_stream_protocols() {
        for kind in [Kind::Claude, Kind::Pi, Kind::Omp] {
            let mut p = protocol(kind);
            let mut out = Vec::new();
            let message = Message {
                id: "two".into(),
                text: "follow up".into(),
                ..Default::default()
            };
            let events = p.steer(message.clone(), &mut out).unwrap();
            let wire: Value = serde_json::from_slice(&out).unwrap();
            if kind == Kind::Claude {
                assert_eq!(wire["type"], "user");
                assert_eq!(events, vec![Event::FollowUp(message)]);
            } else {
                assert_eq!(wire["type"], "steer");
                assert!(events.is_empty());
                assert_eq!(
                    p.frame(
                        json!({"type":"response","id":wire["id"],"success":true}),
                        &mut out
                    )
                    .unwrap(),
                    vec![Event::FollowUp(message)]
                );
            }
        }
    }

    #[cfg(unix)]
    #[test]
    fn running_process_waits_for_turn_readiness_and_streams_after_steering() {
        use std::os::unix::fs::PermissionsExt;
        let temp = tempfile::tempdir().unwrap();
        let binary = temp.path().join("provider");
        std::fs::write(&binary, r##"#!/usr/bin/env python3
import json, sys

def send(value):
    print(json.dumps(value), flush=True)

for line in sys.stdin:
    frame = json.loads(line)
    method = frame.get('method')
    if method == 'initialize':
        send({'id': frame['id'], 'result': {}})
    elif method == 'thread/start':
        send({'id': frame['id'], 'result': {'thread': {'id': 'thread'}}})
    elif method == 'turn/start':
        send({'id': frame['id'], 'result': {'turn': {'id': 'turn'}}})
        send({'method': 'item/agentMessage/delta', 'params': {'itemId': 'before', 'delta': 'Before'}})
    elif method == 'turn/steer':
        send({'id': frame['id'], 'result': {}})
        send({'method': 'item/agentMessage/delta', 'params': {'itemId': 'after', 'delta': 'After'}})
        send({'method': 'turn/completed', 'params': {'turn': {'status': 'completed'}}})
"##).unwrap();
        std::fs::set_permissions(&binary, std::fs::Permissions::from_mode(0o700)).unwrap();
        let (controls, receive) = mpsc::channel();
        let mut delivered = false;
        let mut output = String::new();
        run_with_controls(
            Request {
                kind: Kind::Codex,
                binary,
                cwd: temp.path().into(),
                prompt: "hello".into(),
                provider_id: None,
                model: None,
                settings: Default::default(),
            },
            Arc::new(AtomicBool::new(false)),
            Some(receive),
            |events| {
                for event in events {
                    match event {
                        Event::Ready => controls
                            .send(Control {
                                id: "test".into(),
                                decision: Decision::Steer(Message {
                                    id: "test".into(),
                                    text: "new direction".into(),
                                    ..Default::default()
                                }),
                            })
                            .unwrap(),
                        Event::FollowUp(message) => {
                            assert_eq!(message.id, "test");
                            delivered = true;
                        }
                        Event::Text(text) => {
                            if text == "After" {
                                assert!(
                                    delivered,
                                    "the accepted user message must precede its response"
                                );
                            }
                            output.push_str(&text);
                        }
                        _ => {}
                    }
                }
                Ok(())
            },
        )
        .unwrap();
        assert!(delivered);
        assert_eq!(output, "BeforeAfter");
    }

    #[cfg(unix)]
    #[test]
    fn claude_answers_a_message_steered_too_late_for_the_turn_before_finishing() {
        use std::os::unix::fs::PermissionsExt;
        let temp = tempfile::tempdir().unwrap();
        let binary = temp.path().join("claude");
        std::fs::write(&binary, r##"#!/usr/bin/env python3
import json, sys

def send(value):
    print(json.dumps(value), flush=True)

def answer(text):
    send({'type': 'system', 'subtype': 'init', 'session_id': 'claude-session'})
    send({'type': 'assistant', 'parent_tool_use_id': None, 'message': {'id': text, 'content': [{'type': 'text', 'text': text}]}})

while True:
    line = sys.stdin.readline()
    if not line:
        break
    frame = json.loads(line)
    if frame.get('type') == 'control_request':
        send({'type': 'control_response', 'response': {'request_id': frame['request_id'], 'subtype': 'success'}})
    elif frame.get('type') == 'user':
        answer('First')
        # The second message arrives while the first answer is still being written.
        sys.stdin.readline()
        send({'type': 'result', 'subtype': 'success', 'result': 'First', 'usage': {}})
        answer('Second')
        send({'type': 'result', 'subtype': 'success', 'result': 'Second', 'usage': {}})
"##).unwrap();
        std::fs::set_permissions(&binary, std::fs::Permissions::from_mode(0o700)).unwrap();
        let (controls, receive) = mpsc::channel();
        let mut delivered = false;
        let mut output = String::new();

        run_with_controls(
            Request {
                kind: Kind::Claude,
                binary,
                cwd: temp.path().into(),
                prompt: "do it all".into(),
                provider_id: None,
                model: None,
                settings: Default::default(),
            },
            Arc::new(AtomicBool::new(false)),
            Some(receive),
            |events| {
                for event in events {
                    match event {
                        Event::Ready => controls
                            .send(Control {
                                id: "later".into(),
                                decision: Decision::Steer(Message {
                                    id: "later".into(),
                                    text: "what did we do?".into(),
                                    ..Default::default()
                                }),
                            })
                            .unwrap(),
                        Event::FollowUp(message) => {
                            assert_eq!(message.id, "later");
                            delivered = true;
                        }
                        Event::Text(text) => output.push_str(&text),
                        _ => {}
                    }
                }
                Ok(())
            },
        )
        .unwrap();

        assert!(delivered);
        assert!(
            output.contains("Second"),
            "the turn ended before the steered message was answered: {output:?}"
        );
    }
}
