# TravelPlatform Database Access

## Overview

This document describes how to access the PostgreSQL databases and Redis from external tools like DBeaver.

## Server Details

- **Server IP**: 185.207.105.80
- **SSH User**: root
- **SSH Password**: (stored in .env.ssh)

## Database Credentials

| Database | Proxy Port | Username | Password | Database |
|----------|------------|----------|----------|----------|
| Shuttle | 15501 | shuttle | shuttle_pass | shuttle |
| Seat | 15502 | seat | seat_pass | seat |
| Pricing | 15503 | pricing | pricing_pass | pricing |
| Booking | 15504 | booking | booking_pass | booking |
| Payment | 15505 | payment | payment_pass | payment |
| Promo | 15506 | promo | promo_pass | promo |
| Notification | 15507 | notification | notification_pass | notification |
| Redis | 16379 | - | - | - |

## Method 1: SSH Tunnel (Recommended)

A database proxy service runs on the server to forward connections. Use SSH tunneling to access it securely.

### One-time SSH Tunnel

```bash
# Shuttle database (local port 5501 -> server proxy 15501)
ssh -L 5501:127.0.0.1:15501 root@185.207.105.80

# All databases at once
ssh -L 5501:127.0.0.1:15501 \
    -L 5502:127.0.0.1:15502 \
    -L 5503:127.0.0.1:15503 \
    -L 5504:127.0.0.1:15504 \
    -L 5505:127.0.0.1:15505 \
    -L 5506:127.0.0.1:15506 \
    -L 5507:127.0.0.1:15507 \
    -L 6380:127.0.0.1:16379 \
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
   - **Host**: `127.0.0.1`
   - **Port**: `15501` (shuttle) or other proxy port from table above
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

Use `./infrastructure/scripts/db-tunnel.sh` or run manually:

```bash
ssh -N \
    -L 5501:127.0.0.1:15501 \
    -L 5502:127.0.0.1:15502 \
    -L 5503:127.0.0.1:15503 \
    -L 5504:127.0.0.1:15504 \
    -L 5505:127.0.0.1:15505 \
    -L 5506:127.0.0.1:15506 \
    -L 5507:127.0.0.1:15507 \
    -L 6380:127.0.0.1:16379 \
    root@185.207.105.80
```

## Security Notes

- SSH tunneling is preferred over direct NodePort access
- Database credentials are stored in Kubernetes secrets
- Never commit database passwords to git
- Consider using a VPN for production database access
