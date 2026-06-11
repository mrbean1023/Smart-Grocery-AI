## What

<!-- One or two sentences: what does this PR change and why? -->

## Checklist

- [ ] Tests added/updated and `npm test` passes locally
- [ ] Typecheck passes (`npx tsc -p apps/api/tsconfig.json --noEmit`, same for web)
- [ ] Prisma schema changes include a migration (`prisma migrate dev`) — no drift
- [ ] New env vars added to `.env.example`, k8s `configmap.yaml`/`secrets.yaml`, and README
- [ ] Breaking API changes are flagged and the web app is updated
- [ ] No secrets, credentials, or `.env` files committed

## Notes for reviewers

<!-- Migrations to run, feature flags, rollout caveats, screenshots, etc. -->
