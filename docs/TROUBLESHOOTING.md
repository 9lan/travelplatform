# Troubleshooting Guide

This guide covers common issues and their solutions for the TravelPlatform infrastructure.

## Quick Diagnostics

### Cluster Health Check

```bash
# Node status
kubectl get nodes

# All pods across namespaces
kubectl get pods -A

# TravelPlatform pods
kubectl -n travelplatform get pods

# Recent events
kubectl -n travelplatform get events --sort-by='.lastTimestamp' | tail -20
```

### Service Health Check

```bash
# Check all deployments
kubectl -n travelplatform get deployments

# Check service endpoints
kubectl -n travelplatform get endpoints

# Test gateway health
kubectl -n travelplatform exec deploy/gateway -- wget -qO- http://localhost:4000/health
```

## Common Issues

### 1. Pod Not Starting

#### Symptoms
- Pod stuck in `Pending`, `ContainerCreating`, or `Init` state

#### Diagnosis
```bash
kubectl -n travelplatform describe pod <pod-name>
```

#### Common Causes & Solutions

**Insufficient Resources**
```bash
# Check node resources
kubectl describe nodes | grep -A 5 "Allocated resources"

# Solution: Scale down other workloads or add nodes
kubectl -n travelplatform scale deployment/<name> --replicas=1
```

**Image Pull Errors**
```bash
# Check if image exists
docker pull ghcr.io/travelplatform/gateway:latest

# Check image pull secrets
kubectl -n travelplatform get secrets

# Solution: Ensure GHCR credentials are configured
kubectl -n travelplatform create secret docker-registry ghcr-secret \
  --docker-server=ghcr.io \
  --docker-username=<username> \
  --docker-password=<token>
```

**PVC Not Bound**
```bash
# Check PVC status
kubectl -n travelplatform get pvc

# Check storage class
kubectl get storageclass

# Solution: Ensure storage class exists and has available capacity
```

### 2. CrashLoopBackOff

#### Symptoms
- Pod repeatedly crashing and restarting

#### Diagnosis
```bash
# View current logs
kubectl -n travelplatform logs <pod-name>

# View previous container logs
kubectl -n travelplatform logs <pod-name> --previous

# Check container exit code
kubectl -n travelplatform get pod <pod-name> -o jsonpath='{.status.containerStatuses[0].lastState.terminated.exitCode}'
```

#### Common Causes & Solutions

**Database Connection Failed**
```bash
# Error: "ECONNREFUSED" or "Connection refused"

# Check if database pod is running
kubectl -n travelplatform get pods -l app=postgres-shuttle

# Check database service
kubectl -n travelplatform get svc postgres-shuttle

# Test connection from service pod
kubectl -n travelplatform exec deploy/shuttle-service -- \
  nc -zv postgres-shuttle 5432
```

**Missing Environment Variables**
```bash
# Error: "undefined" or missing config

# Check ConfigMap
kubectl -n travelplatform get configmap services-config -o yaml

# Check Secrets
kubectl -n travelplatform get secret travelplatform-secrets -o yaml

# Verify env vars in pod
kubectl -n travelplatform exec deploy/gateway -- env | grep -E "(DATABASE|REDIS|JWT)"
```

**Prisma Migration Failed**
```bash
# Error: "Migration failed" or "Database schema out of sync"

# Run migration manually
kubectl -n travelplatform exec deploy/shuttle-service -- \
  npx prisma migrate deploy

# Reset database (CAUTION: destroys data)
kubectl -n travelplatform exec deploy/shuttle-service -- \
  npx prisma migrate reset --force
```

### 3. Service Unavailable (502/503/504)

#### Symptoms
- Gateway returns 502 Bad Gateway
- Intermittent 503 Service Unavailable
- 504 Gateway Timeout

#### Diagnosis
```bash
# Check if pods are ready
kubectl -n travelplatform get pods

# Check endpoints
kubectl -n travelplatform get endpoints gateway

# Check ingress
kubectl -n travelplatform describe ingress travelplatform-ingress
```

#### Common Causes & Solutions

**No Ready Pods**
```bash
# Check readiness probe
kubectl -n travelplatform describe pod <pod-name> | grep -A 10 "Readiness"

# Check if health endpoint works
kubectl -n travelplatform exec <pod-name> -- wget -qO- http://localhost:4000/health

# Solution: Fix application health check or adjust probe settings
```

**Service Selector Mismatch**
```bash
# Check service selector
kubectl -n travelplatform get svc gateway -o yaml | grep -A 5 "selector"

# Check pod labels
kubectl -n travelplatform get pods --show-labels

# Solution: Ensure labels match between service and deployment
```

**Ingress Misconfiguration**
```bash
# Check ingress controller logs
kubectl -n ingress-nginx logs deploy/ingress-nginx-controller

# Verify backend service
kubectl -n travelplatform describe ingress travelplatform-ingress
```

### 4. High Latency

#### Symptoms
- Slow API responses
- Timeout errors

#### Diagnosis
```bash
# Check pod resource usage
kubectl -n travelplatform top pods

# Check node resource usage
kubectl top nodes

# View Prometheus metrics
# http://localhost:9090/graph?g0.expr=http_request_duration_seconds
```

#### Common Causes & Solutions

**Resource Constraints**
```bash
# Check resource limits
kubectl -n travelplatform get deploy gateway -o yaml | grep -A 10 "resources"

# Solution: Increase limits
kubectl -n travelplatform patch deployment gateway -p \
  '{"spec":{"template":{"spec":{"containers":[{"name":"gateway","resources":{"limits":{"memory":"1Gi","cpu":"1000m"}}}]}}}}'
```

**Database Slow Queries**
```bash
# Check PostgreSQL slow queries
kubectl -n travelplatform exec postgres-shuttle-0 -- \
  psql -U shuttle -c "SELECT pid, now() - pg_stat_activity.query_start AS duration, query
  FROM pg_stat_activity WHERE state != 'idle' ORDER BY duration DESC LIMIT 10;"

# Add missing indexes
kubectl -n travelplatform exec deploy/shuttle-service -- \
  npx prisma db execute --stdin <<< "CREATE INDEX CONCURRENTLY idx_routes_origin ON \"Route\"(\"originId\");"
```

**Redis Connection Pool Exhaustion**
```bash
# Check Redis connections
kubectl -n travelplatform exec deploy/redis -- redis-cli INFO clients

# Solution: Increase connection pool or fix connection leaks
```

### 5. Memory Issues (OOMKilled)

#### Symptoms
- Pod terminated with OOMKilled
- Application becoming unresponsive before crash

#### Diagnosis
```bash
# Check if OOMKilled
kubectl -n travelplatform get pod <pod-name> -o jsonpath='{.status.containerStatuses[0].lastState.terminated.reason}'

# Check memory usage trend
kubectl -n travelplatform top pods --containers
```

#### Solutions
```bash
# Increase memory limit
kubectl -n travelplatform set resources deployment/gateway \
  --limits=memory=1Gi --requests=memory=512Mi

# Check for memory leaks in application
# - Review heap dumps
# - Check for unclosed connections
# - Review caching strategy
```

### 6. Database Issues

#### Connection Refused
```bash
# Check database pod
kubectl -n travelplatform get pods -l app=postgres-shuttle

# Check database logs
kubectl -n travelplatform logs postgres-shuttle-0

# Check persistent volume
kubectl -n travelplatform get pvc
```

#### Data Corruption
```bash
# Check PostgreSQL logs
kubectl -n travelplatform logs postgres-shuttle-0 | grep -i error

# Run integrity check
kubectl -n travelplatform exec postgres-shuttle-0 -- \
  psql -U shuttle -c "SELECT * FROM pg_catalog.pg_tables WHERE schemaname = 'public';"
```

#### Restore from Backup
```bash
# Restore from backup file
kubectl -n travelplatform exec -i postgres-shuttle-0 -- \
  psql -U shuttle shuttle < backup.sql
```

### 7. Redis Issues

#### Connection Timeout
```bash
# Check Redis pod
kubectl -n travelplatform get pods -l app=redis

# Test Redis connectivity
kubectl -n travelplatform exec deploy/redis -- redis-cli PING

# Check memory
kubectl -n travelplatform exec deploy/redis -- redis-cli INFO memory
```

#### Memory Full
```bash
# Check memory usage
kubectl -n travelplatform exec deploy/redis -- redis-cli INFO memory

# Flush cache (CAUTION: clears all cached data)
kubectl -n travelplatform exec deploy/redis -- redis-cli FLUSHALL

# Set memory policy
kubectl -n travelplatform exec deploy/redis -- \
  redis-cli CONFIG SET maxmemory-policy allkeys-lru
```

### 8. Certificate Issues

#### Certificate Not Ready
```bash
# Check certificate status
kubectl -n travelplatform get certificates

# Check cert-manager logs
kubectl -n cert-manager logs deploy/cert-manager

# Check certificate events
kubectl -n travelplatform describe certificate travelplatform-tls
```

#### Certificate Renewal Failed
```bash
# Delete and recreate certificate
kubectl -n travelplatform delete certificate travelplatform-tls
kubectl apply -k infrastructure/k8s/overlays/production

# Check ACME challenges
kubectl -n travelplatform get challenges
kubectl -n travelplatform describe challenge <challenge-name>
```

## Debugging Commands

### Logs
```bash
# Follow logs
kubectl -n travelplatform logs -f deploy/gateway

# Logs from all containers in pod
kubectl -n travelplatform logs <pod-name> --all-containers

# Logs with timestamps
kubectl -n travelplatform logs deploy/gateway --timestamps

# Previous container logs
kubectl -n travelplatform logs <pod-name> --previous
```

### Shell Access
```bash
# Execute into container
kubectl -n travelplatform exec -it deploy/gateway -- sh

# Run one-off command
kubectl -n travelplatform exec deploy/gateway -- env

# Debug with ephemeral container
kubectl -n travelplatform debug <pod-name> -it --image=busybox
```

### Network Debugging
```bash
# Test DNS resolution
kubectl -n travelplatform exec deploy/gateway -- nslookup shuttle-service

# Test connectivity
kubectl -n travelplatform exec deploy/gateway -- nc -zv shuttle-service 4001

# Check network policies
kubectl -n travelplatform get networkpolicies
```

### Resource Usage
```bash
# Pod resource usage
kubectl -n travelplatform top pods

# Node resource usage
kubectl top nodes

# Detailed resource info
kubectl -n travelplatform describe pod <pod-name> | grep -A 20 "Containers:"
```

## Recovery Procedures

### Rollback Deployment
```bash
# View rollout history
kubectl -n travelplatform rollout history deployment/gateway

# Rollback to previous
kubectl -n travelplatform rollout undo deployment/gateway

# Rollback to specific revision
kubectl -n travelplatform rollout undo deployment/gateway --to-revision=2
```

### Force Pod Restart
```bash
# Restart single pod
kubectl -n travelplatform delete pod <pod-name>

# Restart all pods in deployment
kubectl -n travelplatform rollout restart deployment/gateway

# Restart all deployments
kubectl -n travelplatform rollout restart deployment
```

### Scale Down and Up
```bash
# Scale down (for maintenance)
kubectl -n travelplatform scale deployment --all --replicas=0

# Scale back up
kubectl -n travelplatform scale deployment --all --replicas=2

# Or use scripts
./infrastructure/scripts/deploy-infra.sh deploy -e production
```

## Emergency Contacts

| Role | Contact | When to Escalate |
|------|---------|-----------------|
| On-Call Engineer | See PagerDuty | All critical alerts |
| Database Admin | #db-team | Data corruption, backup restore |
| DevOps Lead | #devops | Infrastructure issues |
| Security Team | security@travelplatform.com | Security incidents |

## Incident Response Checklist

1. [ ] Acknowledge alert in PagerDuty/Slack
2. [ ] Check service status and identify affected components
3. [ ] Check recent deployments (`kubectl rollout history`)
4. [ ] Review logs for errors
5. [ ] Implement fix or rollback
6. [ ] Verify service recovery
7. [ ] Document incident in post-mortem
