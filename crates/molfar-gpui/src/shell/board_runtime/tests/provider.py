#!/usr/bin/env python3
import json, pathlib, sys
root = pathlib.Path(__file__).parent
def send(value):
    print(json.dumps(value), flush=True)
for line in sys.stdin:
    value = json.loads(line)
    method = value.get('method')
    if method == 'initialize':
        send({'id': value['id'], 'result': {}})
    elif method == 'thread/start':
        send({'id': value['id'], 'result': {'thread': {'id': 'fixture-thread'}}})
    elif method == 'turn/start':
        with (root / 'submissions').open('a') as output:
            output.write(json.dumps({'cwd': str(pathlib.Path.cwd()), 'request': value}) + '\n')
        send({'id': value['id'], 'result': {'turn': {'id': 'fixture-turn'}}})
        text = '<<<MOLFAR:spec>>>\nFixture specification\n<<<END:spec>>>\n<<<MOLFAR:plan>>>\nFixture plan\n<<<END:plan>>>'
        send({'method': 'item/agentMessage/delta', 'params': {'itemId': 'answer', 'delta': text}})
        send({'method': 'turn/completed', 'params': {'turn': {'status': 'completed'}}})
        break
