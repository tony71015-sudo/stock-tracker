#!/usr/bin/env python3
"""Insert single JS tag into latest remote index.html, safe against concurrent commits.
Never modifies workflows or institutional source files.
"""
import base64
import json
import os
import time
from urllib.error import HTTPError
from urllib.request import Request, urlopen
from install_index_etf_focus import patch


def api(url, token, method='GET', payload=None):
    req = Request(url, method=method, data=None if payload is None else json.dumps(payload).encode(), headers={
        'Authorization': 'Bearer ' + token, 'Accept': 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28', 'User-Agent': 'trade-compass-index-ui/1.0',
        'Content-Type': 'application/json',
    })
    with urlopen(req, timeout=25) as res: return json.loads(res.read())


def main():
    url = f"https://api.github.com/repos/{os.environ['GITHUB_REPOSITORY']}/contents/index.html"
    token = os.environ['GH_TOKEN']
    for attempt in range(5):
        file = api(url + '?ref=main', token)
        old = base64.b64decode(file['content']).decode('utf-8')
        new, changed = patch(old)
        if not changed:
            print('already installed; index.html unchanged')
            return
        payload = {
            'message':'ui: add index ETF investment focus module (preserve institutions)',
            'content': base64.b64encode(new.encode()).decode(),
            'branch':'main',
            'sha':file['sha'],
        }
        try:
            api(url, token, 'PUT', payload)
            print('index.html updated successfully')
            return
        except HTTPError as e:
            if e.code not in (409,422) or attempt == 4: raise
            time.sleep(attempt + 1)
    raise RuntimeError('Unable to update index.html safely')


if __name__ == '__main__': main()
