#!/usr/bin/env python3
"""Update one JSON path through GitHub Contents API (no git rebase, no force push)."""
import base64
import json
import os
import subprocess
import sys
import time
from urllib.request import Request, urlopen
from urllib.error import HTTPError

TARGET = 'data/index-etf/availability.json'


def call(url, method='GET', payload=None):
    token = os.environ['GH_TOKEN']
    body = None if payload is None else json.dumps(payload).encode()
    req = Request(url, data=body, method=method, headers={
        'Authorization': 'Bearer ' + token,
        'Accept': 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        'User-Agent': 'trade-compass-coverage/1.0',
        'Content-Type': 'application/json',
    })
    with urlopen(req, timeout=25) as response:
        return json.loads(response.read())


def main():
    repo = os.environ['GITHUB_REPOSITORY']
    url = f'https://api.github.com/repos/{repo}/contents/{TARGET}'
    raw = open(TARGET, 'rb').read()
    for attempt in range(5):
        try:
            current = call(url + '?ref=main')
            sha = current['sha']
            existing = base64.b64decode(current['content']) if current.get('encoding') == 'base64' else b''
            if existing == raw:
                print('No changes in coverage report.')
                return
        except HTTPError as exc:
            if exc.code == 404:
                sha = None
            else:
                raise
        payload = {
            'message': 'data: refresh index ETF source availability',
            'content': base64.b64encode(raw).decode(),
            'branch': 'main',
        }
        if sha: payload['sha'] = sha
        try:
            call(url, method='PUT', payload=payload)
            print('Published coverage status to main (single JSON path).')
            return
        except HTTPError as exc:
            if exc.code not in (409, 422) or attempt == 4:
                raise
            time.sleep(1 + attempt)
    raise RuntimeError('GitHub update exhausted safe retries')


if __name__ == '__main__':
    main()
