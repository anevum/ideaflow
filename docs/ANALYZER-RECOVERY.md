# Analyzer recovery checkpoint

This draft preserves the reviewed, compiled analyzer module observed in the
existing deployment on October 30, 2026. Its SHA-256 is
`fcc2ed3a3adab8470c79aee7e2e10326ca142d7456090fa837ad083cb99ca9e0`.
The module is a recovery reference, not an editable-source replacement or a
deployment candidate. The earlier V0.9.2 archive predates the manual-processing
policy and differs from the deployed module.

Run `npm test` using Node.js 22 or later. The synthetic tests check the queue's
manual request gate and the scheduled handler's selection of privacy-retention
paths. The gate tests use mock storage with locks unavailable. Separate tests
exercise the recovered cleanup logic against isolated in-memory SQLite tables
and synthetic audio objects. They do not exercise live Cloudflare integrations,
actual authorization, real recordings, or production backup restoration.

The recovered text cleanup code requires submission and synchronization times
to be at least 24 hours old, no retention hold, an approved knowledge packet,
and a retrieval receipt made no earlier than its approval. It does not impose an
additional 24-hour delay after approval or retrieval. Audio cleanup has separate
conditions and may run promptly after its proof and transcript requirements are
met. These observations describe the recovered version, not a policy change.

The source has no deployment credentials, bindings, recordings, transcripts,
database contents, or deployment workflow. Further rights, source provenance,
retention, authentication, backup and full-system review are required before
merging or deployment. Some historical comments inside the recovered module are
outdated; do not infer current behavior from those comments alone.
