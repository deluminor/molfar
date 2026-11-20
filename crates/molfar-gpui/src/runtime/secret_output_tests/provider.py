#!/usr/bin/env python3
import json
import os
import subprocess
import sys
import time


def send(value):
    print(json.dumps(value), flush=True)


def notify(method, **params):
    send({"method": method, "params": params})


for line in sys.stdin:
    call = json.loads(line)
    if call.get("id") == 1:
        send({"id": 1, "result": {}})
    elif call.get("id") == 2:
        send({"id": 2, "result": {"thread": {"id": "redaction-test"}}})
    elif call.get("id") == 3:
        notify("item/agentMessage/delta", itemId="first", delta="Waiting for fixture")
        deadline = time.monotonic() + 5
        while not os.path.exists(".env"):
            assert time.monotonic() < deadline
            time.sleep(0.01)
        name, value = open(".env", encoding="utf-8").read().strip().split("=", 1)
        output = subprocess.check_output(
            ["sh", "-c", 'echo "$TEST_KEY"; env; cat .env'],
            env={name: value},
            text=True,
        )
        notify("item/completed", item={
            "id": "shell",
            "type": "commandExecution",
            "command": "echo $TEST_KEY; env; cat .env",
            "status": "completed",
            "aggregatedOutput": output,
        })
        notify(
            "item/agentMessage/delta",
            itemId="reply",
            delta="<<<MOLFAR:impl_report>>>Status: complete\nProcessed fictional-",
        )
        notify(
            "item/agentMessage/delta",
            itemId="reply",
            delta="old-value and " + value + "\n<<<END:impl_report>>>",
        )
        notify("turn/completed", turn={"status": "completed"})
        break
