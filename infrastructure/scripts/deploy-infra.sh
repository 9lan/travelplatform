#!/bin/bash
set -euo pipefail

# TravelPlatform Infrastructure Deployment Script
# This script deploys the TravelPlatform infrastructure to Kubernetes

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

log_info() { echo -e "${GREEN}[INFO]${NC} $1"; }
log_warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
log_error() { echo -e "${RED}[ERROR]${NC} $1"; }
log_step() { echo -e "${BLUE}[STEP]${NC} $1"; }

# Configuration
ENVIRONMENT="${ENVIRONMENT:-staging}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"
K8S_DIR="$ROOT_DIR/infrastructure/k8s"
MONITORING_DIR="$ROOT_DIR/infrastructure/monitoring"

# Validate environment
validate_environment() {
    log_step "Validating environment..."

    if [[ "$ENVIRONMENT" != "staging" && "$ENVIRONMENT" != "production" ]]; then
        log_error "Invalid environment: $ENVIRONMENT. Must be 'staging' or 'production'"
        exit 1
    fi

    if ! command -v kubectl &> /dev/null; then
        log_error "kubectl is not installed"
        exit 1
    fi

    if ! command -v kustomize &> /dev/null; then
        log_error "kustomize is not installed"
        exit 1
    fi

    if ! kubectl cluster-info &> /dev/null; then
        log_error "Cannot connect to Kubernetes cluster"
        exit 1
    fi

    log_info "Environment validation passed"
}

# Deploy monitoring stack
deploy_monitoring() {
    log_step "Deploying monitoring stack..."

    kubectl apply -k "$MONITORING_DIR"

    log_info "Waiting for monitoring pods to be ready..."
    kubectl -n monitoring wait --for=condition=Ready pods --all --timeout=300s || true

    log_info "Monitoring stack deployed"
}

# Deploy application
deploy_application() {
    log_step "Deploying TravelPlatform to $ENVIRONMENT..."

    OVERLAY_DIR="$K8S_DIR/overlays/$ENVIRONMENT"

    if [[ ! -d "$OVERLAY_DIR" ]]; then
        log_error "Overlay directory not found: $OVERLAY_DIR"
        exit 1
    fi

    # Dry run first
    log_info "Running dry-run validation..."
    kubectl apply -k "$OVERLAY_DIR" --dry-run=client

    # Apply changes
    log_info "Applying Kubernetes manifests..."
    kubectl apply -k "$OVERLAY_DIR"

    # Get namespace based on environment
    if [[ "$ENVIRONMENT" == "staging" ]]; then
        NAMESPACE="travelplatform-staging"
    else
        NAMESPACE="travelplatform"
    fi

    # Wait for deployments
    log_info "Waiting for deployments to be ready..."

    DEPLOYMENTS=("gateway" "shuttle-service" "seat-service" "pricing-service" "booking-service" "payment-service" "promo-service" "notification-service")

    for deploy in "${DEPLOYMENTS[@]}"; do
        log_info "Waiting for $deploy..."
        kubectl -n "$NAMESPACE" rollout status deployment/"$deploy" --timeout=300s || {
            log_warn "$deploy rollout timed out, continuing..."
        }
    done

    log_info "Application deployed to $ENVIRONMENT"
}

# Health check
health_check() {
    log_step "Running health checks..."

    if [[ "$ENVIRONMENT" == "staging" ]]; then
        NAMESPACE="travelplatform-staging"
    else
        NAMESPACE="travelplatform"
    fi

    # Check pod status
    log_info "Pod status:"
    kubectl -n "$NAMESPACE" get pods

    # Check services
    log_info "Service status:"
    kubectl -n "$NAMESPACE" get services

    # Try to hit health endpoint
    log_info "Checking gateway health..."
    GATEWAY_POD=$(kubectl -n "$NAMESPACE" get pods -l app=gateway -o jsonpath='{.items[0].metadata.name}' 2>/dev/null || echo "")

    if [[ -n "$GATEWAY_POD" ]]; then
        kubectl -n "$NAMESPACE" exec "$GATEWAY_POD" -- wget -q -O- http://localhost:4000/health && log_info "Gateway health check passed" || log_warn "Gateway health check failed"
    else
        log_warn "No gateway pod found"
    fi
}

# Rollback deployment
rollback() {
    log_step "Rolling back deployment..."

    if [[ "$ENVIRONMENT" == "staging" ]]; then
        NAMESPACE="travelplatform-staging"
    else
        NAMESPACE="travelplatform"
    fi

    DEPLOYMENTS=("gateway" "shuttle-service" "seat-service" "pricing-service" "booking-service" "payment-service" "promo-service" "notification-service")

    for deploy in "${DEPLOYMENTS[@]}"; do
        log_info "Rolling back $deploy..."
        kubectl -n "$NAMESPACE" rollout undo deployment/"$deploy" || log_warn "Failed to rollback $deploy"
    done

    log_info "Rollback complete"
}

# Show status
show_status() {
    log_step "Current deployment status..."

    if [[ "$ENVIRONMENT" == "staging" ]]; then
        NAMESPACE="travelplatform-staging"
    else
        NAMESPACE="travelplatform"
    fi

    echo ""
    echo "=== Deployments ==="
    kubectl -n "$NAMESPACE" get deployments

    echo ""
    echo "=== Pods ==="
    kubectl -n "$NAMESPACE" get pods

    echo ""
    echo "=== Services ==="
    kubectl -n "$NAMESPACE" get services

    echo ""
    echo "=== Ingress ==="
    kubectl -n "$NAMESPACE" get ingress

    echo ""
    echo "=== Recent Events ==="
    kubectl -n "$NAMESPACE" get events --sort-by='.lastTimestamp' | tail -10
}

# Print usage
usage() {
    echo "Usage: $0 [command] [options]"
    echo ""
    echo "Commands:"
    echo "  deploy      Deploy the application"
    echo "  monitoring  Deploy monitoring stack only"
    echo "  rollback    Rollback to previous deployment"
    echo "  status      Show deployment status"
    echo "  health      Run health checks"
    echo ""
    echo "Options:"
    echo "  -e, --environment  Environment (staging|production). Default: staging"
    echo ""
    echo "Examples:"
    echo "  $0 deploy -e staging"
    echo "  $0 deploy -e production"
    echo "  $0 status -e production"
    echo "  $0 rollback -e staging"
}

# Parse arguments
COMMAND=""
while [[ $# -gt 0 ]]; do
    case $1 in
        deploy|monitoring|rollback|status|health)
            COMMAND=$1
            shift
            ;;
        -e|--environment)
            ENVIRONMENT="$2"
            shift 2
            ;;
        -h|--help)
            usage
            exit 0
            ;;
        *)
            log_error "Unknown option: $1"
            usage
            exit 1
            ;;
    esac
done

# Main
main() {
    if [[ -z "$COMMAND" ]]; then
        usage
        exit 1
    fi

    log_info "TravelPlatform Infrastructure Deployment"
    log_info "Environment: $ENVIRONMENT"
    log_info "Command: $COMMAND"
    echo ""

    validate_environment

    case $COMMAND in
        deploy)
            deploy_monitoring
            deploy_application
            health_check
            ;;
        monitoring)
            deploy_monitoring
            ;;
        rollback)
            rollback
            ;;
        status)
            show_status
            ;;
        health)
            health_check
            ;;
    esac

    log_info "Done!"
}

main
