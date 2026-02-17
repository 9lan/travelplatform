#!/bin/bash
# TravelPlatform Database SSH Tunnel
# Usage: ./db-tunnel.sh

SSH_HOST="root@185.207.105.80"

echo "=========================================="
echo " TravelPlatform Database SSH Tunnel"
echo "=========================================="
echo ""
echo "Local ports -> Server proxy -> Database:"
echo "  5501 -> 15501 -> postgres-shuttle"
echo "  5502 -> 15502 -> postgres-seat"
echo "  5503 -> 15503 -> postgres-pricing"
echo "  5504 -> 15504 -> postgres-booking"
echo "  5505 -> 15505 -> postgres-payment"
echo "  5506 -> 15506 -> postgres-promo"
echo "  5507 -> 15507 -> postgres-notification"
echo "  6380 -> 16379 -> redis"
echo ""
echo "Connection strings (after tunnel is open):"
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
    -L 5501:127.0.0.1:15501 \
    -L 5502:127.0.0.1:15502 \
    -L 5503:127.0.0.1:15503 \
    -L 5504:127.0.0.1:15504 \
    -L 5505:127.0.0.1:15505 \
    -L 5506:127.0.0.1:15506 \
    -L 5507:127.0.0.1:15507 \
    -L 6380:127.0.0.1:16379 \
    ${SSH_HOST}
