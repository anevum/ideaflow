# IdeaFlow

IdeaFlow is an idea-capture and occasional meeting-workflow project. It is being separated into its own public-safe source repository, independent of the private recordings and transcripts it may process.

## Source status

**Reconciliation pending.** An earlier intake/analyzer/operations code archive and a separate meeting-presenter release have been identified. The older intake implementation predates the latest workflow decision and must not be presumed to match production. No verified standalone source has been imported here yet.

[Draft recovery PR #1](https://github.com/anevum/ideaflow/pull/1) preserves a compiled analyzer reference and synthetic tests. It is not the complete editable application or a deployment candidate; the other services and recovery checks remain outstanding.

## Operating requirements

- Capture is on demand. Meeting transcription retrieval and idea analysis require an explicit manual request; do not restore automatic daily analysis or summary tasks.
- Necessary retention, deletion, privacy, and authorization safeguards must continue independently of manual processing.
- Do not publish recordings, transcripts, private idea content, tokens, provider secrets, private configuration, or historical database exports.
- Identify the authoritative running version and recover the corresponding source before moving deployment ownership.
- Preserve provenance, licenses, tests, and rollback instructions; do not rebuild an existing app to fill the repository.

The current deployed service and private data remain outside this repository until verified transfer.

Project index: [anevum/anevum](https://github.com/anevum/anevum) · Organization handoff: [GitHub reorganization](https://github.com/anevum/anevum/blob/main/handoffs/ANEVUM.OPS.PACKAGE.2026-10-30.002.md)
