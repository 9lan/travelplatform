# TravelPlatform Server Deployment

## Server Details

- **IP Address**: 185.207.105.80
- **OS**: Ubuntu 22.04.5 LTS
- **Resources**: 32GB RAM, 1TB Disk
- **Hostname**: nagagini

## Domains

| Environment | Domain | Status |
|-------------|--------|--------|
| Production | app.kadokadi.com | Active |
| Staging | stg-app.kadokadi.com | Configured |
| Dev | dev-app.kadokadi.com | Configured |

## Infrastructure Installed

### Kubernetes (k3s v1.34.4)
Single-node cluster running k3s lightweight Kubernetes.

### Components
- **Docker**: v29.2.1 (for building images)
- **kubectl**: Latest stable
- **Helm**: v3.20.0
- **NGINX Ingress Controller**: For external traffic routing
- **cert-manager**: For automatic TLS certificates (Let's Encrypt)
- **Prometheus Stack**: For monitoring and alerting
  - Prometheus
  - Grafana (admin/admin)
  - AlertManager

## Deployed Services

### Application Services (8 total)
| Service | Port | Replicas | Status |
|---------|------|----------|--------|
| gateway | 4000 | 2 | Running |
| shuttle-service | 4001 | 2 | Running |
| seat-service | 4002 | 2 | Running |
| pricing-service | 4003 | 2 | Running |
| booking-service | 4004 | 2 | Running |
| payment-service | 4005 | 2 | Running |
| promo-service | 4006 | 2 | Running |
| notification-service | 4007 | 2 | Running |

### Infrastructure Services
| Service | Port | Replicas | Status |
|---------|------|----------|--------|
| Redis | 6379 | 1 | Running |
| PostgreSQL (x7) | 5432 | 1 each | Running |

## Deployment Architecture

```
Internet
    │
    ▼
Cloudflare (Proxy)
    │
    ▼
NGINX Ingress (NodePort 31388/31223)
    │
    ▼
Gateway Service (:4000)
    │
    ├── shuttle-service (:4001) ──► postgres-shuttle
    ├── seat-service (:4002) ──► postgres-seat
    ├── pricing-service (:4003) ──► postgres-pricing
    ├── booking-service (:4004) ──► postgres-booking
    ├── payment-service (:4005) ──► postgres-payment
    ├── promo-service (:4006) ──► postgres-promo
    └── notification-service (:4007) ──► postgres-notification
                                              │
                                              ▼
                                          Redis (:6379)
```

## Namespaces

| Namespace | Purpose |
|-----------|---------|
| travelplatform | Production environment |
| travelplatform-staging | Staging environment |
| travelplatform-dev | Development environment |
| ingress-nginx | NGINX Ingress Controller |
| cert-manager | TLS certificate management |
| monitoring | Prometheus, Grafana, AlertManager |

## Accessing the Server

### SSH Access
```bash
ssh root@185.207.105.80
# Password: (stored in .env.ssh - do not commit to git)
```

### Project Location
```bash
/opt/travelplatform
```

## Common Operations

### Check Pod Status
```bash
kubectl get pods -n travelplatform
```

### Check Logs
```bash
# Gateway logs
kubectl logs deployment/gateway -n travelplatform --tail=50

# Specific service logs
kubectl logs deployment/shuttle-service -n travelplatform --tail=50
```

### Restart a Service
```bash
kubectl rollout restart deployment/<service-name> -n travelplatform
```

### Rebuild and Deploy a Service
```bash
cd /opt/travelplatform

# Build image
docker build -t travelplatform/<service-name>:latest -f apps/<service-name>/Dockerfile .

# Import to k3s
docker save travelplatform/<service-name>:latest | k3s ctr images import -

# Restart deployment
kubectl rollout restart deployment/<service-name> -n travelplatform
```

### Access Grafana
```bash
# Port forward locally
kubectl -n monitoring port-forward svc/prometheus-grafana 3000:80

# Or access via NodePort
# Default credentials: admin / admin
```

### Check Database
```bash
# Connect to postgres-shuttle
kubectl exec -it postgres-shuttle-0 -n travelplatform -- psql -U shuttle -d shuttle
```

### Check Redis
```bash
kubectl exec -it deployment/redis -n travelplatform -- redis-cli
```

## Health Check Endpoints

- **Gateway**: http://app.kadokadi.com/health
- **GraphQL**: http://app.kadokadi.com/graphql

## TLS/SSL Certificates

Certificates are managed by cert-manager with Let's Encrypt.

```bash
# Check certificate status
kubectl get certificate -n travelplatform

# Check certificate requests
kubectl get certificaterequest -n travelplatform

# Check challenges (if certificate pending)
kubectl get challenges -n travelplatform
```

## Troubleshooting

### Pod CrashLoopBackOff
```bash
# Check pod logs
kubectl logs <pod-name> -n travelplatform

# Check previous container logs
kubectl logs <pod-name> -n travelplatform --previous

# Describe pod for events
kubectl describe pod <pod-name> -n travelplatform
```

### Database Connection Issues
```bash
# Test connectivity
kubectl run test-postgres --rm -i --restart=Never --image=postgres:16-alpine -n travelplatform -- psql 'postgresql://shuttle:shuttle_pass@postgres-shuttle:5432/shuttle' -c '\l'
```

### Service Not Reachable
```bash
# Check service endpoints
kubectl get endpoints -n travelplatform

# Check network policies
kubectl get networkpolicies -n travelplatform
```

## Deployment Date
- **Initial Setup**: February 17, 2026

## Files Modified During Setup

### Dockerfiles Updated
All service Dockerfiles in `apps/*/Dockerfile` were updated to:
- Use `pnpm deploy --prod` for isolated deployments
- Copy Prisma generated clients correctly
- Install Prisma CLI v5 for migrations

### Kubernetes Manifests Updated
- `infrastructure/k8s/overlays/production/kustomization.yaml`: Updated domains and image references
- `infrastructure/k8s/overlays/staging/kustomization.yaml`: Updated domains
- `infrastructure/k8s/overlays/dev/kustomization.yaml`: Created new dev overlay
- `infrastructure/k8s/base/ingress/ingress.yaml`: Updated domain to app.kadokadi.com

### Configuration Changes
- Added `REDIS_HOST` and `REDIS_PORT` to configmap (shuttle-service requirement)
- Removed restrictive network policies temporarily for initial deployment
