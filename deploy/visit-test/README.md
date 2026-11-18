# Isolated visit-extraction test installation

This stack starts an unchanged v1.47.6 baseline for developing document-to-visit
extraction. The application commit is
`93f68915dbb3a9d10f13981b6e1eb3c0590a7123`; the published image is pinned by digest.
The visit-extraction feature is not implemented yet.

## Isolation

- Compose project: `healthlog-visit-test`.
- A separate PostgreSQL database, network, database volume and backup volume.
- No production mounts, records, provider credentials or notification settings.
- HTTP binds only to `127.0.0.1:3301`; PostgreSQL has no published port.
- Fresh encryption and authentication keys. Keep `.env` private and out of Git.
- Provider access is unconfigured. Do not import production account settings.
- Memory ceilings: 1536 MiB for the application and 768 MiB for the test database.

Choose a new installation directory on the server and copy `compose.yaml` there.
Create `.env` in that directory with three independently generated 32-byte hex
values named `POSTGRES_PASSWORD`, `ENCRYPTION_KEY` and `API_TOKEN_HMAC_KEY`.
Use file permissions `0600` for `.env` and `0700` for the directory.

The configured application image and `postgres:18.6-alpine` must already exist
locally. `pull_policy: never` prevents an implicit image change.

From the installation directory:

```sh
docker compose config --quiet
docker compose up -d
docker compose ps
curl --fail http://127.0.0.1:3301/api/health
```

The initial startup applies migrations to the empty test database. Once ready,
open a tunnel from the client computer:

```sh
ssh -N -L 127.0.0.1:3301:127.0.0.1:3301 YOUR_SSH_SERVER
```

Then open `http://localhost:3301`. The first registration creates the test
administrator. Use a separate test login and invented profile data. Registration
and medical-document uploads are intentionally not part of stack initialization.

## Updating the test application

Build and load a fork image on the server, set `HEALTHLOG_TEST_IMAGE` in the private
`.env`, validate the configuration, then run `docker compose up -d app` from this
stack's directory. This targets only the test project. The application entrypoint
handles its own migrations and pre-migration database backup.

Keep the previous test image available. If a migration changes the schema, rolling
back the image alone may not suffice; restore the matching test database snapshot.

## Stop without deleting data

Run `docker compose stop` from this stack's directory. The test volumes remain.
Never use production volume names or a production database URL in this stack.

## Visit review flow

This branch adds an explicit **Create visit with AI** action to an owned
document. Automatic lab indexing remains independent. The original is read
in a background job into an encrypted draft; no encounter, illness episode or
medication is created by that read. A review shows the PDF, literal source
excerpts and uncertain fragments. The first four pages are rendered at 3200 px
(JPEG 95); a longer document displays an explicit partial-read notice.

Confirmation creates the visit and source link in one transaction. Replaying
confirmation returns the same visit. Choosing an existing visit replaces only
the reviewed clinical block, with an optimistic updatedAt check; manual notes,
date and other links survive. Illness episodes and medication records remain
manual and are never inferred or merged from a diagnosis.

The clinical block and document draft use nullable encrypted columns on the
existing encounter/document records. Both join encrypted backup/restore and key
rotation. The additive migration does not alter previous records. A date without
a stated time is displayed as a date; local noon is only its timeline anchor.

The **Build isolated visit test image** workflow validates the branch and stores
a Docker image artifact for three days. It does not publish an upstream release
or deploy anything. Load that artifact on the test server, set its exact image
tag in the test `.env`, then recreate only the app in this compose project.
Never run these commands from the production compose directory.

The source-size baseline changes are limited to the existing encounter update
handler (clinical encryption), document sheet/link block (preview and action),
visit restore handler (the new encrypted field), and day reader (same visit's
clinical text). The new review UI is split into smaller components rather than
adding a large review-function baseline.

Visit transcription uses a three-minute provider default, with the existing
per-user response-time setting still taking precedence. The background run's
deadline follows the same effective timeout. Failures retain the prior draft;
timeouts use the translated timeout error, and diagnostics record only stage,
elapsed time and schema field names, never clinical text or provider messages.
