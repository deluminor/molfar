#!/usr/bin/env python3
import json
import os
import socket
import subprocess
import sys
from pathlib import Path


def publish(value):
    print(json.dumps(value), flush=True)


def app(action, request_id, **data):
    host, port = os.environ["MOLFAR_APP_ENDPOINT"].rsplit(":", 1)
    request = {
        "session": int(os.environ["MOLFAR_APP_SESSION"]),
        "token": os.environ["MOLFAR_APP_TOKEN"],
        "action": action,
        "request_id": request_id,
        "input": data,
    }
    with socket.create_connection((host, int(port)), timeout=10) as connection:
        connection.sendall((json.dumps(request) + "\n").encode())
        with connection.makefile() as response:
            envelope = json.loads(response.readline())
    assert envelope["ok"], envelope
    return envelope["result"]


def verify_app_access():
    names = app("secrets.list", "fixture-list")
    assert len(names) == 1 and names[0]["name"] == "FIXTURE_KEY"
    assert set(names[0]) == {"name", "scope", "createdAt"}
    result = app(
        "run",
        "fixture-run",
        argv=["/bin/sh", "-c", 'printf "%s" "$FIXTURE_KEY"'],
        secrets=[{"name": "FIXTURE_KEY", "env": "FIXTURE_KEY"}],
    )
    assert result["exitCode"] == 0 and result["stdout"] == "[secret:FIXTURE_KEY]"


if len(sys.argv) > 1 and sys.argv[1] == "--app-calls":
    try:
        verify_app_access()
    except Exception as error:
        status = type(error).__name__
    else:
        status = "verified"
    Path("operator-fixture-result").write_text(status, encoding="utf-8")
    sys.exit(0)


for line in sys.stdin:
    message = json.loads(line)
    if message.get("id") == 1:
        publish({"id": 1, "result": {}})
    elif message.get("id") == 2:
        publish({"id": 2, "result": {"thread": {"id": "operator-fixture"}}})
    elif message.get("id") == 3:
        # TestAppContext runs the provider synchronously. The app client can wait
        # for shell work only after the fixture transport returns control.
        # The test peer has its own bounded socket lifetime even if the provider
        # is retired as soon as it completes the turn.
        subprocess.Popen(
            [sys.executable, __file__, "--app-calls"],
            stdin=subprocess.DEVNULL,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            start_new_session=True,
        )
        publish({"method": "turn/completed", "params": {"turn": {"status": "completed"}}})
        break
