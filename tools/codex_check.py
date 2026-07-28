"""Pre-flight check for codex image generation. RUN THIS FIRST.

Why this exists: on 2026-07-27 image generation began returning
`403 Forbidden` with no useful detail. Two days were spent treating it as a
prompt problem, a flag problem and a quota problem. It was none of those — the
ChatGPT Plus subscription had EXPIRED at 2026-07-27T15:39Z, one day after the
last successful generation.

`codex login status` says "Logged in using ChatGPT" either way, because the
OAuth token is still valid; only the entitlement behind it is gone. That is what
makes this failure so easy to misdiagnose, and why the check has to be explicit.

    python3 tools/codex_check.py

Exit 0 = good to generate. Exit 1 = the reason is printed; do not start a batch.
"""
import base64
import datetime
import io
import json
import os
import shutil
import subprocess
import sys

AUTH = os.path.expanduser('~/.codex/auth.json')


def fail(msg, fix=''):
    print(f'  BLOCKED: {msg}')
    if fix:
        print(f'  FIX:     {fix}')
    sys.exit(1)


def main():
    if not shutil.which('codex'):
        fail('the codex CLI is not on PATH', 'install it: https://github.com/openai/codex')

    # ⚠️ shell=True on Windows: `codex` is a .cmd shim, so CreateProcess cannot
    # launch it by bare name even though `which` resolves it. The version is
    # informational, so a failure here must not block the real check below.
    try:
        ver = subprocess.run('codex --version', shell=True, capture_output=True,
                             text=True, timeout=60).stdout.strip()
    except Exception:
        ver = ''
    print(f'  codex:   {ver or "unknown"}')

    if not os.path.exists(AUTH):
        fail('not logged in (no ~/.codex/auth.json)', 'codex login')

    d = json.load(io.open(AUTH, encoding='utf-8'))
    tok = (d.get('tokens') or {}).get('id_token')
    if not tok or tok.count('.') != 2:
        fail('no readable id_token in auth.json', 'codex login')

    payload = tok.split('.')[1]
    payload += '=' * (-len(payload) % 4)
    claims = json.loads(base64.urlsafe_b64decode(payload))
    auth = claims.get('https://api.openai.com/auth', {})

    plan = auth.get('chatgpt_plan_type', 'unknown')
    until = auth.get('chatgpt_subscription_active_until')
    print(f'  plan:    {plan}')

    # ⚠️ THE CHECK THAT MATTERS. Everything else can look perfectly healthy
    # while this one field is in the past.
    if until:
        end = datetime.datetime.fromisoformat(until.replace('Z', '+00:00'))
        now = datetime.datetime.now(datetime.timezone.utc)
        left = (end - now).days
        print(f'  until:   {end.date()}  ({left:+d} days)')
        if now > end:
            fail(
                f'the ChatGPT {plan} subscription EXPIRED on {end.date()} — image '
                f'generation returns 403 Forbidden even though login still reports OK',
                'renew the ChatGPT subscription, then re-run this check',
            )
        if left <= 7:
            print(f'  WARNING: expires in {left} days — do not start a long batch')
    else:
        print('  until:   not stated in the token (cannot verify)')

    print('  READY — image generation should work.')
    return 0


if __name__ == '__main__':
    sys.exit(main())
