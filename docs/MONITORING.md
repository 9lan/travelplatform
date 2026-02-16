# Monitoring Guide

This guide covers the monitoring stack, dashboards, and alerting for TravelPlatform.

## Overview

The monitoring stack consists of:

- **Prometheus**: Metrics collection and storage
- **Grafana**: Visualization and dashboards
- **AlertManager**: Alert routing and notifications

## Accessing Dashboards

### Grafana

```bash
# Port forward to local machine
kubectl -n monitoring port-forward svc/grafana 3000:3000

# Access at http://localhost:3000
# Default credentials: admin / admin (change in production!)
```

### Prometheus

```bash
# Port forward Prometheus UI
kubectl -n monitoring port-forward svc/prometheus 9090:9090

# Access at http://localhost:9090
```

### AlertManager

```bash
# Port forward AlertManager UI
kubectl -n monitoring port-forward svc/alertmanager 9093:9093

# Access at http://localhost:9093
```

## Dashboards

### TravelPlatform Services Dashboard

Shows key metrics for all microservices:

- **Service Health**: Up/down status for each service
- **Request Rate**: Requests per second by service
- **Error Rate**: 5xx errors as percentage of total requests
- **Request Latency**: p50 and p95 response times
- **Memory Usage**: Container memory consumption

### Pre-built Dashboards

Import these Grafana dashboards for additional insights:

| Dashboard | ID | Description |
|-----------|-----|-------------|
| Kubernetes Cluster | 315 | Cluster overview |
| Node Exporter | 1860 | Node metrics |
| PostgreSQL | 9628 | Database metrics |
| Redis | 11835 | Redis metrics |
| NGINX Ingress | 9614 | Ingress traffic |

To import:
1. Go to Dashboards → Import
2. Enter dashboard ID
3. Select Prometheus data source
4. Click Import

## Key Metrics

### Application Metrics

| Metric | Description | Good Value |
|--------|-------------|------------|
| `http_requests_total` | Total HTTP requests | Increasing |
| `http_request_duration_seconds` | Request latency | p95 < 2s |
| `http_requests_total{status=~"5.."}` | Error count | Near 0 |

### Infrastructure Metrics

| Metric | Description | Alert Threshold |
|--------|-------------|-----------------|
| `up` | Service availability | 0 = down |
| `container_memory_usage_bytes` | Memory usage | > 90% limit |
| `container_cpu_usage_seconds_total` | CPU usage | > 90% limit |
| `kube_pod_container_status_restarts_total` | Pod restarts | > 5/hour |

### Database Metrics

| Metric | Description | Alert Threshold |
|--------|-------------|-----------------|
| `pg_up` | PostgreSQL availability | 0 = down |
| `pg_stat_activity_count` | Active connections | > 80% max |
| `pg_stat_activity_max_tx_duration` | Long queries | > 60s |

### Redis Metrics

| Metric | Description | Alert Threshold |
|--------|-------------|-----------------|
| `redis_up` | Redis availability | 0 = down |
| `redis_memory_used_bytes` | Memory usage | > 90% max |
| `redis_connected_clients` | Client count | > 100 |

## Alerts

### Alert Rules

The following alerts are configured:

#### Service Alerts

| Alert | Severity | Trigger |
|-------|----------|---------|
| ServiceDown | Critical | Service unreachable for 1 minute |
| HighErrorRate | Critical | Error rate > 5% for 2 minutes |
| HighLatency | Warning | p95 latency > 2s for 5 minutes |
| PodRestartLoop | Warning | > 5 restarts in 1 hour |
| HighMemoryUsage | Warning | Memory > 90% for 5 minutes |
| HighCPUUsage | Warning | CPU > 90% for 5 minutes |

#### Database Alerts

| Alert | Severity | Trigger |
|-------|----------|---------|
| PostgreSQLConnectionFailure | Critical | Cannot connect for 1 minute |
| PostgreSQLHighConnections | Warning | > 80% max connections |
| PostgreSQLSlowQueries | Warning | Queries > 60s running |

#### Redis Alerts

| Alert | Severity | Trigger |
|-------|----------|---------|
| RedisConnectionFailure | Critical | Cannot connect for 1 minute |
| RedisHighMemory | Warning | Memory > 90% for 5 minutes |
| RedisHighClients | Warning | > 100 connected clients |

#### Infrastructure Alerts

| Alert | Severity | Trigger |
|-------|----------|---------|
| NodeNotReady | Critical | Node not ready for 5 minutes |
| HighNodeMemory | Warning | Node memory > 90% |
| HighNodeDisk | Warning | Disk usage > 85% |
| PersistentVolumeRunningLow | Warning | PV < 20% remaining |

### Alert Routing

Alerts are routed based on severity:

```yaml
# Critical alerts
→ #alerts-critical (Slack)
→ oncall@travelplatform.com (Email)

# Warning alerts
→ #alerts (Slack)
```

### Silencing Alerts

To silence an alert during maintenance:

1. Go to AlertManager UI
2. Click "Silence"
3. Add matchers for the alert
4. Set duration and comment
5. Click "Create"

Or via CLI:

```bash
# Create silence
amtool silence add alertname=ServiceDown service=gateway --comment="Maintenance" --duration=1h
```

## Configuring Notifications

### Slack Integration

1. Create a Slack incoming webhook
2. Update AlertManager config:

```yaml
# infrastructure/monitoring/alertmanager/alertmanager-config.yaml
global:
  slack_api_url: 'https://hooks.slack.com/services/YOUR/WEBHOOK/URL'
```

3. Apply changes:

```bash
kubectl apply -f infrastructure/monitoring/alertmanager/alertmanager-config.yaml
```

### Email Integration

Update AlertManager config with SMTP settings:

```yaml
global:
  smtp_smarthost: 'smtp.gmail.com:587'
  smtp_from: 'alerts@travelplatform.com'
  smtp_auth_username: 'alerts@travelplatform.com'
  smtp_auth_password: 'app-password'
```

### PagerDuty Integration

```yaml
receivers:
  - name: 'pagerduty'
    pagerduty_configs:
      - service_key: 'YOUR-PAGERDUTY-KEY'
```

## Custom Metrics

### Adding Application Metrics

Services should expose metrics on `/metrics` endpoint:

```typescript
// Example with prom-client
import { Counter, Histogram, register } from 'prom-client';

const httpRequestsTotal = new Counter({
  name: 'http_requests_total',
  help: 'Total HTTP requests',
  labelNames: ['method', 'path', 'status'],
});

const httpRequestDuration = new Histogram({
  name: 'http_request_duration_seconds',
  help: 'HTTP request duration',
  labelNames: ['method', 'path'],
  buckets: [0.01, 0.05, 0.1, 0.5, 1, 2, 5],
});
```

### Adding Custom Alerts

1. Add rule to `infrastructure/monitoring/alertmanager/alert-rules.yaml`
2. Apply changes:

```bash
kubectl apply -f infrastructure/monitoring/alertmanager/alert-rules.yaml
```

Example custom alert:

```yaml
- alert: BookingServiceHighLatency
  expr: |
    histogram_quantile(0.99,
      sum(rate(http_request_duration_seconds_bucket{service="booking-service"}[5m])) by (le)
    ) > 3
  for: 5m
  labels:
    severity: warning
    service: booking-service
  annotations:
    summary: "Booking service p99 latency is high"
    description: "p99 latency is {{ $value | humanizeDuration }}"
```

## Troubleshooting

### Prometheus Not Scraping

```bash
# Check scrape targets
kubectl -n monitoring port-forward svc/prometheus 9090:9090
# Go to http://localhost:9090/targets

# Check service discovery
kubectl -n monitoring logs deploy/prometheus
```

### Missing Metrics

```bash
# Verify metrics endpoint
kubectl -n travelplatform exec deploy/gateway -- wget -qO- http://localhost:4000/metrics

# Check Prometheus config
kubectl -n monitoring get configmap prometheus-config -o yaml
```

### AlertManager Not Sending Alerts

```bash
# Check AlertManager logs
kubectl -n monitoring logs deploy/alertmanager

# Verify alert is firing
kubectl -n monitoring port-forward svc/prometheus 9090:9090
# Go to http://localhost:9090/alerts

# Test alert routing
kubectl -n monitoring exec deploy/alertmanager -- amtool check-config /etc/alertmanager/alertmanager.yml
```

### Grafana Dashboard Issues

```bash
# Check Grafana logs
kubectl -n monitoring logs deploy/grafana

# Verify data source
# In Grafana: Configuration → Data Sources → Prometheus → Test
```

## Maintenance

### Upgrading Prometheus Stack

```bash
helm repo update
helm upgrade prometheus prometheus-community/kube-prometheus-stack \
  --namespace monitoring \
  --reuse-values
```

### Backup Grafana Dashboards

```bash
# Export dashboards
kubectl -n monitoring exec deploy/grafana -- \
  grafana-cli admin export-dashboard <uid> > dashboard.json
```

### Retention Settings

Default retention is 15 days. To change:

```yaml
# In Prometheus config
--storage.tsdb.retention.time=30d
```

## Best Practices

1. **Use labels consistently** across all services
2. **Set appropriate thresholds** based on SLOs
3. **Avoid alert fatigue** by tuning alert rules
4. **Document runbooks** for each alert
5. **Test alerts regularly** to ensure they fire correctly
6. **Keep dashboards simple** with clear purpose
7. **Use recording rules** for expensive queries
