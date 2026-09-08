# Wildleaf Production Release Automation

This repository uses a guarded GitHub Actions release path for the production website.

## Safety model

Ordinary pull-request merges do not deploy production.

A production release can start only when either:

1. a merge commit on `main` contains the marker `[deploy]`; or
2. the `Production Release` workflow is manually dispatched from `main` with the exact confirmation `DEPLOY`.

The intended ChatGPT-assisted workflow is:

1. make changes on a safe branch;
2. run pull-request CI;
3. obtain explicit approval for any existing-file edits before those edits are made;
4. obtain explicit production-deployment approval;
5. add `[deploy]` to the pull-request title only after that approval;
6. merge with a merge commit;
7. GitHub Actions validates and releases the exact merged commit.

## Release pipeline

Before production changes, the workflow:

- runs the full Platform API quality gate against PostgreSQL;
- runs migration apply/down/apply smoke testing locally;
- runs the admin and customer frontend contract tests;
- verifies the Firebase routing contract.

Production steps then:

- authenticate to Google Cloud through keyless Workload Identity Federation;
- snapshot the existing 100% Cloud Run revision;
- verify the expected runtime service account, Cloud SQL attachment, and DATABASE_URL wiring;
- build an immutable backend image tagged from the Git commit;
- run production migrations through `wildleaf-platform-migrator` and `MIGRATION_DATABASE_URL`;
- deploy a tagged Cloud Run candidate at 0% traffic;
- verify `/v1/public/homepage` on the candidate;
- move 100% traffic to the verified candidate;
- verify the same API through `www.wildleafstays.com`;
- restore the previous backend revision automatically if that live API check fails;
- deploy Firebase Hosting;
- compare key live static files byte-for-byte with the release commit.

Previous Cloud Run revisions are not deleted.

## One-time Google Cloud trust setup

The workflow intentionally uses no long-lived Google service-account JSON key.

The Google Cloud project needs:

- Workload Identity Pool: `github-actions`
- OIDC provider: `wildleaf-prod`
- deployer service account:
  `wildleaf-github-deployer@wildleafstays-web.iam.gserviceaccount.com`

Provider resource expected by the workflow:

`projects/63965798517/locations/global/workloadIdentityPools/github-actions/providers/wildleaf-prod`

The provider must admit only:

- repository: `wildleafstays/wildleafstays-firebase`
- ref: `refs/heads/main`

The deployer service account needs project-level:

- `roles/cloudbuild.builds.editor`
- `roles/run.admin`
- `roles/firebasehosting.admin`
- `roles/serviceusage.serviceUsageConsumer`

It also needs `roles/iam.serviceAccountUser` on:

- `wildleaf-platform-api@wildleafstays-web.iam.gserviceaccount.com`
- `wildleaf-platform-migrator@wildleafstays-web.iam.gserviceaccount.com`

The GitHub repository principal needs `roles/iam.workloadIdentityUser` on the deployer service account.

The dedicated migrator retains its existing Cloud SQL and Secret Manager permissions. The deployment identity is not given the migration database password.

## Production database rule

Never run `migrate:prod:down` in production.

Production schema migrations must remain backward-compatible with the currently deployed backend so that the previous Cloud Run revision remains a valid rollback target.
