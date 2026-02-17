# TravelPlatform Database Access

## Overview

This document describes how to access the PostgreSQL databases and Redis from external tools like DBeaver.

## Server Details

- **Server IP**: 185.207.105.80
- **SSH User**: root
- **SSH Password**: (stored in .env.ssh)

## Database Credentials

| Database | Service Name | Internal Port | Username | Password | Database |
|----------|--------------|---------------|----------|----------|----------|
| Shuttle | postgres-shuttle | 5432 | shuttle | shuttle_pass | shuttle |
| Seat | postgres-seat | 5432 | seat | seat_pass | seat |
| Pricing | postgres-pricing | 5432 | pricing | pricing_pass | pricing |
| Booking | postgres-booking | 5432 | booking | booking_pass | booking |
| Payment | postgres-payment | 5432 | payment | payment_pass | payment |
| Promo | postgres-promo | 5432 | promo | promo_pass | promo |
| Notification | postgres-notification | 5432 | notification | notification_pass | notification |
| Redis | redis | 6379 | - | - | - |

## Method 1: SSH Tunnel (Recommended)

SSH tunneling is the most secure way to access the databases.

### One-time SSH Tunnel

```bash
# Shuttle database (local port 5501 -> postgres-shuttle:5432)
ssh -L 5501:postgres-shuttle.travelplatform.svc.cluster.local:5432 root@185.207.105.80

# Seat database
ssh -L 5502:postgres-seat.travelplatform.svc.cluster.local:5432 root@185.207.105.80

# All databases at once
ssh -L 5501:postgres-shuttle.travelplatform.svc.cluster.local:5432 \
    -L 5502:postgres-seat.travelplatform.svc.cluster.local:5432 \
    -L 5503:postgres-pricing.travelplatform.svc.cluster.local:5432 \
    -L 5504:postgres-booking.travelplatform.svc.cluster.local:5432 \
    -L 5505:postgres-payment.travelplatform.svc.cluster.local:5432 \
    -L 5506:postgres-promo.travelplatform.svc.cluster.local:5432 \
    -L 5507:postgres-notification.travelplatform.svc.cluster.local:5432 \
    -L 6380:redis.travelplatform.svc.cluster.local:6379 \
    root@185.207.105.80
```

### DBeaver SSH Tunnel Configuration

1. Create new PostgreSQL connection
2. Go to **SSH** tab
3. Enable **Use SSH Tunnel**
4. Configure:
   - **Host**: `185.207.105.80`
   - **Port**: `22`
   - **User**: `root`
   - **Authentication**: Password
   - **Password**: (from .env.ssh)
5. Go to **Main** tab
6. Configure:
   - **Host**: `postgres-shuttle.travelplatform.svc.cluster.local` (or other service name)
   - **Port**: `5432`
   - **Database**: `shuttle` (or matching database name)
   - **Username**: `shuttle` (or matching username)
   - **Password**: `shuttle_pass` (or matching password)

## Method 2: kubectl Port Forward

If you have kubectl configured locally:

```bash
# Forward shuttle database
kubectl port-forward -n travelplatform svc/postgres-shuttle 5432:5432

# Forward all databases (run in separate terminals)
kubectl port-forward -n travelplatform svc/postgres-shuttle 5501:5432 &
kubectl port-forward -n travelplatform svc/postgres-seat 5502:5432 &
kubectl port-forward -n travelplatform svc/postgres-pricing 5503:5432 &
kubectl port-forward -n travelplatform svc/postgres-booking 5504:5432 &
kubectl port-forward -n travelplatform svc/postgres-payment 5505:5432 &
kubectl port-forward -n travelplatform svc/postgres-promo 5506:5432 &
kubectl port-forward -n travelplatform svc/postgres-notification 5507:5432 &
kubectl port-forward -n travelplatform svc/redis 6380:6379 &
```

Then connect to `localhost:5501` (shuttle), `localhost:5502` (seat), etc.

## Quick Connection Strings

After setting up SSH tunnel, use these connection strings:

### PostgreSQL

```
# Shuttle
postgresql://shuttle:shuttle_pass@localhost:5501/shuttle

# Seat
postgresql://seat:seat_pass@localhost:5502/seat

# Pricing
postgresql://pricing:pricing_pass@localhost:5503/pricing

# Booking
postgresql://booking:booking_pass@localhost:5504/booking

# Payment
postgresql://payment:payment_pass@localhost:5505/payment

# Promo
postgresql://promo:promo_pass@localhost:5506/promo

# Notification
postgresql://notification:notification_pass@localhost:5507/notification
```

### Redis

```
redis://localhost:6380
```

## SSH Tunnel Helper Script

Save this as `db-tunnel.sh`:

```bash
#!/bin/bash
# TravelPlatform Database SSH Tunnel

SSH_HOST="root@185.207.105.80"
NAMESPACE="travelplatform"

echo "Starting SSH tunnel to TravelPlatform databases..."
echo "Local ports:"
echo "  5501 -> postgres-shuttle"
echo "  5502 -> postgres-seat"
echo "  5503 -> postgres-pricing"
echo "  5504 -> postgres-booking"
echo "  5505 -> postgres-payment"
echo "  5506 -> postgres-promo"
echo "  5507 -> postgres-notification"
echo "  6380 -> redis"
echo ""
echo "Press Ctrl+C to close the tunnel"

ssh -N \
    -L 5501:postgres-shuttle.${NAMESPACE}.svc.cluster.local:5432 \
    -L 5502:postgres-seat.${NAMESPACE}.svc.cluster.local:5432 \
    -L 5503:postgres-pricing.${NAMESPACE}.svc.cluster.local:5432 \
    -L 5504:postgres-booking.${NAMESPACE}.svc.cluster.local:5432 \
    -L 5505:postgres-payment.${NAMESPACE}.svc.cluster.local:5432 \
    -L 5506:postgres-promo.${NAMESPACE}.svc.cluster.local:5432 \
    -L 5507:postgres-notification.${NAMESPACE}.svc.cluster.local:5432 \
    -L 6380:redis.${NAMESPACE}.svc.cluster.local:6379 \
    ${SSH_HOST}
```

## Security Notes

- SSH tunneling is preferred over direct NodePort access
- Database credentials are stored in Kubernetes secrets
- Never commit database passwords to git
- Consider using a VPN for production database access
