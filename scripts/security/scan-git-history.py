#!/usr/bin/env python3
"""Targeted credential-pattern scan of Git objects reachable from local refs.

Adapted from anevum/brandle under Apache-2.0. This is a lightweight
credential and sensitive-path guard, not a comprehensive privacy scan. It
prints object IDs and rule names, never matching text. Fetch relevant refs before
running; it cannot see branches absent from the local clone.
"""
import re
import subprocess
import sys

RULES = {
    'private-key': rb'-----BEGIN (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----',
    'github-token': rb'\b(?:gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{50,})\b',
    'aws-access-key': rb'\b(?:AKIA|ASIA)[A-Z0-9]{16}\b',
    'openai-key': rb'\bsk-(?:proj-)?[A-Za-z0-9_-]{32,}\b',
    'slack-token': rb'\bxox[baprs]-[A-Za-z0-9-]{20,}\b',
    'google-api-key': rb'\bAIza[0-9A-Za-z_-]{35}\b',
    'notion-token': rb'\b(?:secret_|ntn_)[A-Za-z0-9]{32,}\b',
    'sensitive-assignment': rb'''(?i)(?:api[_-]?key|access[_-]?token|client[_-]?secret|password|private[_-]?key)\s*[:=]\s*["'][A-Za-z0-9+/_=-]{24,}["']''',
}
PATTERNS = {name: re.compile(pattern) for name, pattern in RULES.items()}


def main():
    objects = subprocess.run(['git', 'rev-list', '--objects', '--all', '--no-object-names'],
                             check=True, stdout=subprocess.PIPE).stdout.splitlines()
    if not objects:
        raise RuntimeError('No reachable Git objects; refusing an empty scan')
    process = subprocess.Popen(['git', 'cat-file', '--batch'], stdin=subprocess.PIPE,
                               stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    scanned = skipped_binary = 0
    findings = []

    # Check filenames across reachable commit history, including paths deleted
    # from the current tree. Do not print filenames: they may themselves be PII.
    # A private artifact committed even briefly must be remediated from history.
    changed_paths = subprocess.run(
        ['git', 'log', '--all', '--no-renames', '--name-only', '--pretty=format:'],
        check=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE
    ).stdout.splitlines()
    for raw_path in changed_paths:
        path = raw_path.strip().lower().replace(b'\\', b'/')
        if not path:
            continue
        parts = path.split(b'/')
        filename = parts[-1]
        private_directories = {
            b'transcripts', b'recordings', b'private', b'backups',
            b'exports', b'patient-data', b'client-data', b'clinical-data'
        }
        artifact_extensions = (
            b'.sqlite', b'.sqlite3', b'.db', b'.db3', b'.bak',
            b'.dump', b'.sql.gz', b'.jsonl', b'.csv', b'.wav',
            b'.mp3', b'.m4a', b'.flac', b'.ogg', b'.opus',
            b'.mp4', b'.mov', b'.webm', b'.p12', b'.pfx'
        )
        forbidden_environment = (
            filename.startswith(b'.env')
            and filename not in (b'.env.example', b'.env.sample', b'.env.template')
        )
        if (private_directories.intersection(parts)
                or filename.endswith(artifact_extensions)
                or filename in (b'id_rsa', b'id_ed25519')
                or forbidden_environment):
            findings.append(('filename-history', 'private-artifact-path'))
            break
    try:
        for oid in dict.fromkeys(objects):
            process.stdin.write(oid + b'\n')
            process.stdin.flush()
            header = process.stdout.readline().rstrip(b'\n').split()
            if len(header) != 3 or not header[2].isdigit():
                raise RuntimeError('Could not read a Git object')
            size = int(header[2])
            body = process.stdout.read(size)
            if len(body) != size or process.stdout.read(1) != b'\n':
                raise RuntimeError('Incomplete Git object stream')
            if header[1] != b'blob':
                continue
            if b'\x00' in body:
                skipped_binary += 1
                continue
            scanned += 1
            for name, pattern in PATTERNS.items():
                if pattern.search(body):
                    findings.append((oid.decode('ascii'), name))
    finally:
        process.stdin.close()
        process.stdout.close()
        stderr = process.stderr.read()
        process.stderr.close()
        if process.wait() != 0:
            raise RuntimeError('git cat-file failed: ' + stderr.decode('utf-8', 'replace')[:200])
    if not scanned:
        raise RuntimeError('No text blobs scanned; refusing an empty scan')
    for oid, name in findings:
        print(f'Potential public-source exposure: object {oid}, rule {name}')
    print(f'Targeted scan: {scanned} text blobs; {skipped_binary} binary blobs skipped; {len(findings)} matches')
    print('Only local refs and selected patterns are covered; binary contents are not scanned.')
    return 1 if findings else 0


if __name__ == '__main__':
    try:
        sys.exit(main())
    except (OSError, RuntimeError, subprocess.CalledProcessError) as error:
        print(f'Scan failed: {error}', file=sys.stderr)
        sys.exit(2)
