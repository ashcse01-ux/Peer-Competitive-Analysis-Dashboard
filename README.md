# FreshBus Competitor Benchmarking Dashboard

A competitive intelligence dashboard tracking FreshBus, Neugo, FlixBus, Zingbus, Leafy, and IntrCity SmartBus across Google Play, iOS App Store, Google Reviews, and Redbus route-level data.

---

## Local Quickstart

```bash
# 1. Clone and enter the repo
git clone <repo-url>
cd freshbus-competitor-dashboard

# 2. Copy and configure environment variables
cp .env.example .env
# Edit .env — set POSTGRES_PASSWORD and optionally PROXY_LIST / ADMIN_TOKEN

# 3. Start all services
docker compose up --build

# 4. Open the dashboard
open http://localhost:3000
```

Services started:
| Service   | URL                       |
|-----------|---------------------------|
| Dashboard | http://localhost:3000     |
| API       | http://localhost:8000     |
| API docs  | http://localhost:8000/docs|
| Health    | http://localhost:8000/health |

---

## Environment Variables Reference

| Variable          | Required | Description |
|-------------------|----------|-------------|
| `DATABASE_URL`    | Yes      | PostgreSQL connection string |
| `POSTGRES_DB`     | Yes      | Database name (used by Docker db service) |
| `POSTGRES_USER`   | Yes      | Database username |
| `POSTGRES_PASSWORD` | Yes    | Database password |
| `PROXY_LIST`      | No       | Comma-separated proxy URLs for scraper rotation |
| `ADMIN_TOKEN`     | No       | Bearer token required for `POST /api/v1/refresh/trigger`. Leave blank to disable auth. |
| `NLP_MODEL_NAME`  | No       | HuggingFace model ID. Default: `cardiffnlp/twitter-xlm-roberta-base-sentiment` |
| `API_HOST`        | No       | FastAPI bind host. Default: `0.0.0.0` |
| `API_PORT`        | No       | FastAPI port. Default: `8000` |
| `LOG_LEVEL`       | No       | Logging level. Default: `INFO` |
| `VITE_API_BASE_URL` | No     | Base URL the React dashboard uses to call the API |

---

## Manual Refresh

Trigger a full data refresh without waiting for the monthly cron:

```bash
# Without auth (when ADMIN_TOKEN is not set)
curl -X POST http://localhost:8000/api/v1/refresh/trigger

# With auth
curl -X POST http://localhost:8000/api/v1/refresh/trigger \
  -H "Authorization: Bearer <your-ADMIN_TOKEN>"

# Check refresh status
curl http://localhost:8000/api/v1/refresh/status
```

---

## Running Tests

```bash
# Install dev dependencies
pip install -r requirements.txt

# Run all Python tests
pytest tests/ -v

# Run specific module tests
pytest tests/test_sentiment.py -v
pytest tests/test_api.py -v
```

---

## AWS Deployment

Prerequisites: AWS CLI configured, Terraform ≥ 1.6, Docker.

```bash
# 1. Build and push the API image to ECR
aws ecr create-repository --repository-name freshbus-api --region ap-south-1
docker build -f docker/Dockerfile.api -t freshbus-api .
docker tag freshbus-api:latest <account-id>.dkr.ecr.ap-south-1.amazonaws.com/freshbus-api:latest
docker push <account-id>.dkr.ecr.ap-south-1.amazonaws.com/freshbus-api:latest

# 2. Build and upload the dashboard to S3
cd dashboard && npm ci && npm run build
aws s3 sync dist/ s3://freshbus-dashboard-ap-south-1/

# 3. Deploy infrastructure
cd ../infra/aws
terraform init
terraform apply \
  -var="api_image=<account-id>.dkr.ecr.ap-south-1.amazonaws.com/freshbus-api:latest" \
  -var="db_password=<secure-password>"

# 4. Note the CloudFront URL from Terraform outputs
terraform output cloudfront_url
```

---

## Project Structure

```
.
├── scraper/           # Data collection (app stores, Google, Redbus)
│   ├── collectors/    # AppStoreCollector, GoogleReviewsCollector, RedbusCollector
│   └── utils/         # retry, user_agents, proxy_pool, logger
├── aggregator/        # Sentiment engine, metrics calculator, orchestrator
├── api/               # FastAPI backend + routers
├── dashboard/         # React 18 + Vite + Recharts frontend
├── db/                # init.sql — schema + seed data
├── docker/            # Dockerfiles + nginx.conf
├── infra/aws/         # Terraform IaC
└── tests/             # Pytest unit & integration tests
```

---

## Data Refresh Schedule

Data refreshes automatically on the **1st of every month at 02:00 UTC**. Near-real-time updates are applied where sources provide public APIs. The Dashboard header displays the last successful refresh timestamp and warns when any source has stale data.
