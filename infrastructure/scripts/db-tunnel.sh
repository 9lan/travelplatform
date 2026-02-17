#!/bin/bash
# TravelPlatform Database SSH Tunnel
# Usage: ./db-tunnel.sh

SSH_HOST="root@185.207.105.80"
NAMESPACE="travelplatform"

echo "=========================================="
echo " TravelPlatform Database SSH Tunnel"
echo "=========================================="
echo ""
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
echo "Connection strings:"
echo "  postgresql://shuttle:shuttle_pass@localhost:5501/shuttle"
echo "  postgresql://seat:seat_pass@localhost:5502/seat"
echo "  postgresql://pricing:pricing_pass@localhost:5503/pricing"
echo "  postgresql://booking:booking_pass@localhost:5504/booking"
echo "  postgresql://payment:payment_pass@localhost:5505/payment"
echo "  postgresql://promo:promo_pass@localhost:5506/promo"
echo "  postgresql://notification:notification_pass@localhost:5507/notification"
echo "  redis://localhost:6380"
echo ""
echo "Press Ctrl+C to close the tunnel"
echo "=========================================="

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
