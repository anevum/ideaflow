# Analyzer recovery checkpoint

This draft preserves the reviewed, compiled analyzer module observed in the
existing deployment on October 30, 2026. Its SHA-256 is
`fcc2ed3a3adab8470c79aee7e2e10326ca142d7456090fa837ad083cb99ca9e0`.
The module is a recovery reference, not an editable-source replacement or a
deployment candidate. The earlier V0.9.2 archive predates the manual-processing
policy and differs from the deployed module.

Run `npm test` using Node.js 22 or later. The synthetic tests check the queue's
manual request gate and the scheduled handler's selection of privacy-retention
paths. They use mock storage with locks unavailable and do not exercise actual
transcription, deletion, Cloudflare integrations or real authorization. They do
not establish compliance or release readiness.

The source has no deployment credentials, bindings, recordings, transcripts,
database contents, or deployment workflow. Further rights, source provenance,
retention, authentication, backup and full-system review are required before
merging or deployment. Some historical comments inside the recovered module are
outdated; do not infer current behavior from those comments alone.
