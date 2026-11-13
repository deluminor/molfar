#!/usr/bin/env python3
import json
import pathlib
import subprocess
import sys
import time

root = pathlib.Path(__file__).parent


def send(value):
    print(json.dumps(value), flush=True)


def response(value):
    request = json.dumps(value)
    stage = next((name for name in ('Implement', 'Rework', 'Code review')
                  if f'You are the {name} stage' in request), 'Grill')
    behavior = (root / 'behavior').read_text().strip() if (root / 'behavior').exists() else ''
    cwd = pathlib.Path.cwd()
    if stage in ('Implement', 'Rework') or (stage == 'Code review' and behavior == 'review-write'):
        assert cwd.resolve() != (root / 'project').resolve()
        common = subprocess.check_output(['git', 'rev-parse', '--git-common-dir'], text=True).strip()
        assert (cwd / common).resolve() == (root / 'project' / '.git').resolve()
        if behavior != 'no-commit':
            (cwd / 'tracked.txt').write_text(f'{stage} changed the fixture {time.time_ns()}\n')
        if stage != 'Code review' and behavior not in ('dirty', 'no-commit'):
            subprocess.run(['git', 'add', 'tracked.txt'], check=True, stdout=subprocess.DEVNULL)
            subprocess.run(['git', '-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.test',
                            '-c', 'commit.gpgsign=false', 'commit', '-qm', f'fixture: {stage}'], check=True,
                           stdout=subprocess.DEVNULL)
    if (root / 'pause-stage').exists() and (root / 'pause-stage').read_text().strip() == stage:
        while not (root / 'release').exists():
            time.sleep(0.01)
    if behavior == 'bad-output' and stage != 'Grill':
        return 'Missing output blocks'
    if stage == 'Code review':
        return ('<<<MOLFAR:review>>>Verdict: CHANGES_REQUESTED\n\n'
                '## F1 [minor] Fixture race\nFile: tracked.txt:1\nFix this race.\n\n'
                '## F2 [nit] Optional rename\nOptional.<<<END:review>>>\n'
                '<<<MOLFAR:pr_description>>>Fixture PR description<<<END:pr_description>>>')
    if stage in ('Implement', 'Rework'):
        return f'<<<MOLFAR:impl_report>>>Status: complete\n{stage} fixture report<<<END:impl_report>>>'
    return ('<<<MOLFAR:spec>>>\nFixture specification\n<<<END:spec>>>\n'
            '<<<MOLFAR:plan>>>\nFixture plan\n<<<END:plan>>>')


for line in sys.stdin:
    value = json.loads(line)
    method = value.get('method')
    if method == 'initialize':
        send({'id': value['id'], 'result': {}})
    elif method == 'thread/start':
        send({'id': value['id'], 'result': {'thread': {'id': 'fixture-thread'}}})
    elif method == 'thread/resume':
        with (root / 'resumes').open('a') as output:
            output.write(json.dumps(value.get('params', {})) + '\n')
        send({'id': value['id'], 'result': {'thread': {'id': 'fixture-thread'}}})
    elif method == 'thread/compact/start':
        with (root / 'compactions').open('a') as output:
            output.write(json.dumps(value.get('params', {})) + '\n')
        send({'id': value['id'], 'result': {}})
        send({'method': 'thread/compacted', 'params': {'threadId': 'fixture-thread'}})
        send({'method': 'turn/completed', 'params': {'turn': {'status': 'completed', 'items': []}}})
        break
    elif method == 'turn/start':
        with (root / 'submissions').open('a') as output:
            output.write(json.dumps({'cwd': str(pathlib.Path.cwd()), 'request': value}) + '\n')
        send({'id': value['id'], 'result': {'turn': {'id': 'fixture-turn'}}})
        send({'method': 'item/agentMessage/delta', 'params': {'itemId': 'answer', 'delta': response(value)}})
        send({'method': 'turn/completed', 'params': {'turn': {'status': 'completed'}}})
        break
