#!/usr/bin/env python3
import json
import os
import sys


def send(frame):
    print(json.dumps(frame), flush=True)


def event(method, **params):
    send({"method": method, "params": params})


for line in sys.stdin:
    frame = json.loads(line)
    identifier = frame.get("id")
    if identifier == 1:
        send({"id": 1, "result": {}})
    elif identifier == 2:
        send({"id": 2, "result": {"thread": {"id": "fixture-secret-reply"}}})
    elif identifier == 3:
        send({
            "id": 17,
            "method": "item/tool/requestUserInput",
            "params": {"questions": [
                {"id": "pin", "question": "PIN?", "isSecret": True},
                {"id": "token", "question": "Token?", "isSecret": True},
            ]},
        })
    elif identifier == 17:
        answers = frame["result"]["answers"]
        pin = answers["pin"]["answers"][0]
        token = answers["token"]["answers"][0]
        bound = os.environ["FIXTURE_BINDING"]
        event("item/completed", item={
            "id": "provider-echo",
            "type": "commandExecution",
            "command": "fixture",
            "status": "completed",
            "aggregatedOutput": f"{pin} · {token} · {bound}",
        })
        event("item/agentMessage/delta", itemId="reply", delta="Provider returned (" + pin[:2])
        event("item/agentMessage/delta", itemId="reply", delta=pin[2:] + ") " + token)
        event("turn/completed", turn={"status": "completed"})
        break
