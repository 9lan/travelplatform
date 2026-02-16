# Deployment Guide

This guide covers building, deploying, and managing the TravelPlatform infrastructure.

## Prerequisites

- Docker 24+
- kubectl 1.28+
- Helm 3.12+
- Access to Kubernetes cluster
- GitHub account with repository access

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                        Internet                                  │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                    NGINX Ingress Controller                      │
│                    (TLS termination)                             │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                         Gateway                                  │
│                    (Apollo Federation)                           │
│                        Port: 4000                                │
└─────────────────────────────────────────────────────────────────┘
          │           │           │           │           │
          ▼           ▼           ▼           ▼           ▼
    ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐
    │ Shuttle │ │  Seat   │ │ Pricing │ │ Booking │ │   ...   │
    │  :4001  │ │  :4002  │ │  :4003  │ │  :4004  │ │         │
    └─────────┘ └─────────┘ └─────────┘ └─────────┘ └─────────┘
          │           │           │           │
          ▼           ▼           ▼           ▼
    ┌─────────────────────────────────────────────────────────────┐
    │                    PostgreSQL Databases                      │
    │         (7 independent databases per service)                │
    └─────────────────────────────────────────────────────────────┘
                              │
                              ▼
    ┌─────────────────────────────────────────────────────────────┐
    │                          Redis                               │
    │              (Caching + BullMQ job queues)                   │
    └─────────────────────────────────────────────────────────────┘
```

## Quick Start

### Local Development

```bash
# Start infrastructure (databases + redis)
cd infrastructure
docker-compose up -d

# Install dependencies
pnpm install

# Generate Prisma clients
pnpm --filter "*-service" db:generate

# Push database schemas
pnpm --filter "*-service" db:push

# Start all services
pnpm dev
```

### Production Deployment

```bash
# Setup a new server
sudo ./infrastructure/scripts/setup-server.sh

# Deploy to staging
./infrastructure/scripts/deploy-infra.sh deploy -e staging

# Deploy to production
./infrastructure/scripts/deploy-infra.sh deploy -e production
```

## Building Docker Images

### Build All Services

```bash
# Build all images locally
for service in gateway shuttle-service seat-service pricing-service booking-service payment-service promo-service notification-service; do
  docker build -t travelplatform/$service:latest -f apps/$service/Dockerfile .
done
```

### Build Single Service

```bash
# Build specific service
docker build -t travelplatform/gateway:latest -f apps/gateway/Dockerfile .
```

### CI/CD Builds

Images are automatically built and pushed to GHCR when code is pushed or merged to `deploy-prod` (production), `deploy-stg` (staging), and `deploy-dev` (development):

```
ghcr.io/<org>/travelplatform/gateway:deploy-prod
ghcr.io/<org>/travelplatform/gateway:deploy-stg
ghcr.io/<org>/travelplatform/gateway:deploy-dev
ghcr.io/<org>/travelplatform/shuttle-service:deploy-prod
# ... etc
```

## Kubernetes Deployment

### Directory Structure

```
infrastructure/k8s/
├── base/                    # Base manifests
│   ├── namespace.yaml
│   ├── configmaps/
│   ├── secrets/
│   ├── deployments/
│   ├── services/
│   ├── hpa/
│   ├── ingress/
│   ├── network-policies/
│   └── database/
├── overlays/
│   ├── staging/             # Staging overrides
│   │   └── kustomization.yaml
│   └── production/          # Production overrides
│       └── kustomization.yaml
└── kustomization.yaml
```

### Deploy with Kustomize

```bash
# Validate manifests
kubectl apply -k infrastructure/k8s/overlays/staging --dry-run=client

# Deploy to staging
kubectl apply -k infrastructure/k8s/overlays/staging

# Deploy to production
kubectl apply -k infrastructure/k8s/overlays/production
```

### Environment Differences

| Configuration | Staging | Production |
|--------------|---------|------------|
| Replicas | 1 | 2-3 |
| HPA Max Replicas | 3 | 15 |
| Memory Request | 128Mi | 512Mi |
| Memory Limit | 256Mi | 1Gi |
| CPU Request | 50m | 200m |
| CPU Limit | 250m | 1000m |
| DB Storage | 10Gi | 50Gi |

## Configuration

### Environment Variables

Services read configuration from ConfigMaps and Secrets:

```yaml
# ConfigMap (non-sensitive)
NODE_ENV: production
REDIS_URL: redis://redis:6379
GATEWAY_URL: http://gateway:4000

# Secrets (sensitive)
JWT_SECRET: <base64-encoded>
DATABASE_URL: <base64-encoded>
TIKETUX_CLIENT_SECRET: <base64-encoded>
```

### Updating Secrets

```bash
# Create/update secret
kubectl -n travelplatform create secret generic travelplatform-secrets \
  --from-literal=JWT_SECRET="your-secret" \
  --from-literal=SHUTTLE_DATABASE_URL="postgresql://..." \
  --dry-run=client -o yaml | kubectl apply -f -
```

## Rollback Procedures

### Rollback Deployment

```bash
# Rollback single deployment
kubectl -n travelplatform rollout undo deployment/gateway

# Rollback all deployments
./infrastructure/scripts/deploy-infra.sh rollback -e production

# Rollback to specific revision
kubectl -n travelplatform rollout undo deployment/gateway --to-revision=2
```

### View Rollout History

```bash
kubectl -n travelplatform rollout history deployment/gateway
```

### Database Rollback

See [Prisma Migrations Guide](./prisma-migrations.md) for database rollback procedures.

## Health Checks

### Check Service Health

```bash
# Gateway health
kubectl -n travelplatform exec deploy/gateway -- wget -qO- http://localhost:4000/health

# Check all pods
kubectl -n travelplatform get pods

# Check deployment status
kubectl -n travelplatform get deployments
```

### Readiness vs Liveness

- **Liveness Probe**: Restarts container if unhealthy (30s initial delay)
- **Readiness Probe**: Removes from service if unhealthy (5s initial delay)

Both probes hit `/health` endpoint.

## Scaling

### Manual Scaling

```bash
# Scale deployment
kubectl -n travelplatform scale deployment/gateway --replicas=5

# Scale all services
for deploy in gateway shuttle-service seat-service; do
  kubectl -n travelplatform scale deployment/$deploy --replicas=3
done
```

### Horizontal Pod Autoscaler

HPAs are configured for critical services:

```bash
# View HPA status
kubectl -n travelplatform get hpa

# Describe HPA
kubectl -n travelplatform describe hpa gateway-hpa
```

HPA Configuration:
- Min replicas: 2 (staging: 1)
- Max replicas: 10-15
- CPU target: 70%
- Memory target: 80%

## Troubleshooting

### Common Issues

1. **Pods stuck in Pending**
   ```bash
   kubectl -n travelplatform describe pod <pod-name>
   # Check for resource constraints or node issues
   ```

2. **CrashLoopBackOff**
   ```bash
   kubectl -n travelplatform logs <pod-name> --previous
   # Check for application errors
   ```

3. **ImagePullBackOff**
   ```bash
   # Check image exists and credentials are correct
   kubectl -n travelplatform get events --field-selector reason=Failed
   ```

4. **Database Connection Issues**
   ```bash
   # Test database connectivity from pod
   kubectl -n travelplatform exec deploy/shuttle-service -- \
     npx prisma db execute --stdin <<< "SELECT 1"
   ```

### Useful Commands

```bash
# View logs
kubectl -n travelplatform logs -f deploy/gateway

# View events
kubectl -n travelplatform get events --sort-by='.lastTimestamp'

# Execute into pod
kubectl -n travelplatform exec -it deploy/gateway -- sh

# Port forward for local debugging
kubectl -n travelplatform port-forward svc/gateway 4000:4000
```

## CI/CD Workflows

### Workflow Files

| Workflow | Trigger | Description |
|----------|---------|-------------|
| `ci.yaml` | PR, Push | Lint, typecheck, test |
| `build-images.yaml` | Push to main | Build and push Docker images |
| `deploy-staging.yaml` | After build | Auto-deploy to staging |
| `deploy-production.yaml` | Manual | Production deployment |

### Required Secrets

Configure these in GitHub repository settings:

- `STAGING_KUBECONFIG`: Base64-encoded kubeconfig for staging
- `PRODUCTION_KUBECONFIG`: Base64-encoded kubeconfig for production

### Manual Production Deploy

1. Go to Actions → Deploy to Production
2. Click "Run workflow"
3. Enter version tag (commit SHA or "latest")
4. Type "DEPLOY" to confirm
5. Click "Run workflow"

## Maintenance

### Certificate Renewal

Certificates are managed by cert-manager and auto-renewed. To check:

```bash
kubectl -n travelplatform get certificates
kubectl -n travelplatform describe certificate travelplatform-tls
```

### Database Backups

Configure automated backups in your cloud provider or use:

```bash
# Manual backup
kubectl -n travelplatform exec postgres-shuttle-0 -- \
  pg_dump -U shuttle shuttle > backup.sql
```

### Log Rotation

Logs are handled by the container runtime. For persistent logging, integrate with:
- ELK Stack (Elasticsearch, Logstash, Kibana)
- Loki + Grafana
- Cloud provider logging (CloudWatch, Stackdriver)
