# IdeaFlow public-source history guard

This is a **verification-only** gate on the isolated, non-deploying IdeaFlow analyzer recovery branch. It does not change any running Worker, database, queue, Access policy, or retention timer.

## Coverage

- Scan text Git blobs reachable from locally checked-out refs for selected credential formats, including credentials present in commits where the current tree is clean.
- Inspect file paths in reachable commit history for likely private recordings, transcripts, exports, database files, environment files and other sensitive artifacts. It reports only a rule name, never a filename or matching value.
- Test synthetic deleted-token, deleted-transcript, protected-environment-file, benign-template and empty-repository cases before scanning.
- The CI checkout fetches full history for the available refs and runs with read-only GitHub permissions and **no deployment credentials**.

Run from a checkout with relevant refs:

```sh
python3 -m unittest discover -s scripts/security -p 'test_*.py'
python3 scripts/security/scan-git-history.py
npm test
```

## Important limits

This is a narrow guard, **not** full sensitive-data clearance. It does not verify arbitrary PII/PHI in ordinary text, binary contents, off-branch or unreachable history, unavailable remote refs, encrypted archives, third-party rights, or actual production source parity. Repository history containing genuine exposed secrets requires private credential revocation and careful history response; passing tests do not erase past publication.

Some nonprivate demonstration assets may match conservative filename patterns and require documented manual review. Do not weaken checks or commit real private data to make a test pass.

## Provenance

`scan-git-history.py` and its tests were adapted from `anevum/brandle/scripts/` and retain an Apache-2.0 license notice at `scripts/security/LICENSE`. This is **only** a license for the security utility; the recovered analyzer's publication rights and the rest of IdeaFlow's eventual license still require independent review. The recovered compiled analyzer is not an independently deployable source release.
