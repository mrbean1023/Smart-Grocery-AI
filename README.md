# Smart Grocery AI Singapore

Scan recipes and receipts, compare grocery prices across Singapore supermarkets, and optimize your basket with AI.

## Features

- Recipe/receipt scanning (OCR + AI extraction) with monthly free-tier limits
- Grocery price comparison across stores (Elasticsearch-backed search)
- AI basket optimization and shopping assistant (OpenAI)
- Freemium billing with Stripe (free vs premium tiers)
- Email/password + Google SSO auth, transactional email
- Background jobs (BullMQ) and scheduled price refresh (cron)
- Prometheus metrics + Grafana dashboard out of the box

## Architecture

```
                       ┌──────────────────────────────────────────┐
                       │                  AWS ALB                  │
                       └───────┬──────────────────────┬───────────┘
                               │                      │
                      ┌────────▼───────┐     ┌────────▼───────┐
                      │  web (Next.js) │────▶│  api (NestJS)  │
                      │     :3000      │     │  :4000 + BullMQ│
                      └────────────────┘     │  worker + cron │
                                             └───┬──┬──┬──┬───┘
                                                 │  │  │  │
                  ┌──────────────────────────────┘  │  │  └──────────────┐
                  │                 ┌────────────────┘  └──────┐         │
         ┌────────▼───────┐ ┌───────▼──────┐ ┌─────────────────▼──┐ ┌────▼────┐
         │ PostgreSQL 16  │ │   Redis 7    │ │  Elasticsearch 8   │ │ S3/MinIO│
         │  (+ pgvector)  │ │(queues/cache)│ │  (product search)  │ │(uploads)│
         └────────────────┘ └──────────────┘ └────────────────────┘ └─────────┘

         External: OpenAI (extraction/assistant) · Google Vision (OCR)
                   Stripe (billing) · SMTP (email) · Prometheus/Grafana
```

## Quickstart (local dev)

```bash
cp .env.example .env          # defaults work out of the box
docker compose up -d          # postgres, redis, elasticsearch, minio, mailhog, prometheus, grafana
npm install
npm run db:generate           # prisma client
npm run db:migrate            # apply migrations
npm run db:seed               # demo data
npm run dev                   # api on :4000, web on :3000
```

Demo login: `demo@smartgrocery.sg` / `Demo1234!`

## Services & ports

| Service        | URL / port              | Notes                      |
| -------------- | ----------------------- | -------------------------- |
| Web (Next.js)  | http://localhost:3000   |                            |
| API (NestJS)   | http://localhost:4000   | `/v1/health`, `/metrics`   |
| PostgreSQL     | localhost:5432          | pgvector/pg16              |
| Redis          | localhost:6379          | BullMQ queues              |
| Elasticsearch  | http://localhost:9200   | single node                |
| MinIO          | :9000 (console :9001)   | S3-compatible uploads      |
| Mailhog        | http://localhost:8025   | catches all dev email      |
| Prometheus     | http://localhost:9090   |                            |
| Grafana        | http://localhost:3001   | admin / admin              |

## Environment variables

Everything lives in `.env` (see `.env.example` for the full list). Optional keys degrade gracefully:

| Group     | Keys                                                          | Without them                                  |
| --------- | ------------------------------------------------------------- | --------------------------------------------- |
| Core      | `DATABASE_URL`, `REDIS_URL`, `ELASTICSEARCH_NODE`             | Required — app won't start                    |
| Auth      | `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`, `NEXTAUTH_SECRET`  | Required — use real random values outside dev |
| AI        | `OPENAI_API_KEY`                                              | No AI extraction/assistant; matching quality drops |
| OCR       | `GOOGLE_APPLICATION_CREDENTIALS`, `GCP_PROJECT_ID`            | Falls back to OpenAI vision for OCR           |
| Billing   | `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, price IDs       | Billing/upgrades disabled                     |
| SSO       | `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`                    | Google login hidden; email/password still works |
| Storage   | `AWS_*`, `S3_BUCKET`, `S3_ENDPOINT`                           | Defaults to local MinIO in dev                |
| Email     | `SMTP_*`                                                      | Defaults to Mailhog in dev                    |
| Telemetry | `SENTRY_DSN`, `PROMETHEUS_ENABLED`                            | Error tracking / metrics off                  |
| Flags     | `FREEMIUM_ENFORCED`, `FREE_TIER_*`                            | Free-tier limits                              |

## Testing

```bash
npm test          # unit tests (apps/api)
npm run test:e2e  # e2e tests (needs postgres + redis from docker compose)
```

## Deployment

**Containers (full stack locally):**

```bash
docker compose --profile app up -d --build   # adds api + web containers
```

**Kubernetes (EKS + kustomize):**

```bash
kubectl apply -k infra/k8s/overlays/staging      # or overlays/production
```

Base manifests live in `infra/k8s/base` (api/web deployments + HPAs, single-node Elasticsearch, ALB ingress). Secrets are `CHANGE_ME` placeholders — use External Secrets Operator or Sealed Secrets in real clusters.

**AWS infrastructure (Terraform, ap-southeast-1):**

```bash
cd infra/terraform
cp terraform.tfvars.example terraform.tfvars   # edit values
terraform init && terraform apply              # 1. VPC, EKS, RDS, Redis, S3+CDN, ECR, IRSA
# 2. push images (CI does this to GHCR; or docker push to the ECR outputs)
# 3. kubectl apply -k infra/k8s/overlays/production
```

CI/CD: `ci.yml` (lint, typecheck, tests, image build/push to GHCR on main) → `deploy-staging.yml` (auto after CI on main) → `deploy-production.yml` (on GitHub release, gated by the `production` environment approval).

## Branching strategy

Trunk-based development:

- `main` is protected — no direct pushes
- Work on `feature/*` branches; open a PR; CI must pass before merge
- Merging to `main` auto-deploys to staging
- Production deploys happen from tagged releases (`v1.2.3`) with manual approval

## License

MIT
