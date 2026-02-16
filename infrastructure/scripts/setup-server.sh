#!/bin/bash
set -euo pipefail

# TravelPlatform Server Setup Script
# This script sets up a new server with all required components for running the platform

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

log_info() { echo -e "${GREEN}[INFO]${NC} $1"; }
log_warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
log_error() { echo -e "${RED}[ERROR]${NC} $1"; }

# Check if running as root
if [[ $EUID -ne 0 ]]; then
   log_error "This script must be run as root"
   exit 1
fi

# Detect OS
if [ -f /etc/os-release ]; then
    . /etc/os-release
    OS=$ID
else
    log_error "Cannot detect OS"
    exit 1
fi

log_info "Detected OS: $OS"

# Configuration
DOMAIN="${DOMAIN:-api.travelplatform.com}"
EMAIL="${EMAIL:-admin@travelplatform.com}"
INSTALL_TYPE="${INSTALL_TYPE:-k3s}" # k3s or kubeadm

# Update system
log_info "Updating system packages..."
case $OS in
    ubuntu|debian)
        apt-get update && apt-get upgrade -y
        apt-get install -y curl wget git jq apt-transport-https ca-certificates gnupg lsb-release
        ;;
    centos|rhel|fedora)
        yum update -y
        yum install -y curl wget git jq
        ;;
    *)
        log_error "Unsupported OS: $OS"
        exit 1
        ;;
esac

# Install Docker
install_docker() {
    log_info "Installing Docker..."

    if command -v docker &> /dev/null; then
        log_info "Docker already installed"
        return
    fi

    case $OS in
        ubuntu|debian)
            curl -fsSL https://download.docker.com/linux/$OS/gpg | gpg --dearmor -o /usr/share/keyrings/docker-archive-keyring.gpg
            echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/docker-archive-keyring.gpg] https://download.docker.com/linux/$OS $(lsb_release -cs) stable" | tee /etc/apt/sources.list.d/docker.list > /dev/null
            apt-get update
            apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
            ;;
        centos|rhel|fedora)
            yum install -y yum-utils
            yum-config-manager --add-repo https://download.docker.com/linux/centos/docker-ce.repo
            yum install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
            ;;
    esac

    systemctl enable docker
    systemctl start docker
    log_info "Docker installed successfully"
}

# Install kubectl
install_kubectl() {
    log_info "Installing kubectl..."

    if command -v kubectl &> /dev/null; then
        log_info "kubectl already installed"
        return
    fi

    curl -LO "https://dl.k8s.io/release/$(curl -L -s https://dl.k8s.io/release/stable.txt)/bin/linux/amd64/kubectl"
    install -o root -g root -m 0755 kubectl /usr/local/bin/kubectl
    rm kubectl

    log_info "kubectl installed successfully"
}

# Install Helm
install_helm() {
    log_info "Installing Helm..."

    if command -v helm &> /dev/null; then
        log_info "Helm already installed"
        return
    fi

    curl https://raw.githubusercontent.com/helm/helm/main/scripts/get-helm-3 | bash

    log_info "Helm installed successfully"
}

# Install k3s (lightweight Kubernetes)
install_k3s() {
    log_info "Installing k3s..."

    if command -v k3s &> /dev/null; then
        log_info "k3s already installed"
        return
    fi

    curl -sfL https://get.k3s.io | sh -s - --write-kubeconfig-mode 644

    # Set up kubectl config
    mkdir -p ~/.kube
    cp /etc/rancher/k3s/k3s.yaml ~/.kube/config
    chmod 600 ~/.kube/config

    # Wait for k3s to be ready
    log_info "Waiting for k3s to be ready..."
    sleep 30
    kubectl wait --for=condition=Ready nodes --all --timeout=300s

    log_info "k3s installed successfully"
}

# Install kubeadm (for production clusters)
install_kubeadm() {
    log_info "Installing kubeadm..."

    # Disable swap
    swapoff -a
    sed -i '/ swap / s/^\(.*\)$/#\1/g' /etc/fstab

    # Load required modules
    cat <<EOF | tee /etc/modules-load.d/k8s.conf
overlay
br_netfilter
EOF
    modprobe overlay
    modprobe br_netfilter

    # Configure sysctl
    cat <<EOF | tee /etc/sysctl.d/k8s.conf
net.bridge.bridge-nf-call-iptables  = 1
net.bridge.bridge-nf-call-ip6tables = 1
net.ipv4.ip_forward                 = 1
EOF
    sysctl --system

    # Install kubeadm, kubelet, kubectl
    case $OS in
        ubuntu|debian)
            curl -fsSL https://pkgs.k8s.io/core:/stable:/v1.28/deb/Release.key | gpg --dearmor -o /etc/apt/keyrings/kubernetes-apt-keyring.gpg
            echo 'deb [signed-by=/etc/apt/keyrings/kubernetes-apt-keyring.gpg] https://pkgs.k8s.io/core:/stable:/v1.28/deb/ /' | tee /etc/apt/sources.list.d/kubernetes.list
            apt-get update
            apt-get install -y kubelet kubeadm kubectl
            apt-mark hold kubelet kubeadm kubectl
            ;;
        centos|rhel|fedora)
            cat <<EOF | tee /etc/yum.repos.d/kubernetes.repo
[kubernetes]
name=Kubernetes
baseurl=https://pkgs.k8s.io/core:/stable:/v1.28/rpm/
enabled=1
gpgcheck=1
gpgkey=https://pkgs.k8s.io/core:/stable:/v1.28/rpm/repodata/repomd.xml.key
EOF
            yum install -y kubelet kubeadm kubectl
            ;;
    esac

    systemctl enable kubelet

    # Initialize cluster
    kubeadm init --pod-network-cidr=10.244.0.0/16

    # Set up kubectl config
    mkdir -p ~/.kube
    cp /etc/kubernetes/admin.conf ~/.kube/config
    chmod 600 ~/.kube/config

    # Install Calico network plugin
    kubectl apply -f https://raw.githubusercontent.com/projectcalico/calico/v3.26.1/manifests/calico.yaml

    # Allow scheduling on control plane (for single node)
    kubectl taint nodes --all node-role.kubernetes.io/control-plane-

    log_info "kubeadm installed successfully"
}

# Install NGINX Ingress Controller
install_nginx_ingress() {
    log_info "Installing NGINX Ingress Controller..."

    helm repo add ingress-nginx https://kubernetes.github.io/ingress-nginx
    helm repo update

    helm upgrade --install ingress-nginx ingress-nginx/ingress-nginx \
        --namespace ingress-nginx \
        --create-namespace \
        --set controller.service.type=LoadBalancer \
        --set controller.metrics.enabled=true \
        --set controller.metrics.serviceMonitor.enabled=true

    # Wait for ingress controller to be ready
    kubectl -n ingress-nginx wait --for=condition=Ready pods --all --timeout=300s

    log_info "NGINX Ingress Controller installed successfully"
}

# Install cert-manager
install_cert_manager() {
    log_info "Installing cert-manager..."

    helm repo add jetstack https://charts.jetstack.io
    helm repo update

    helm upgrade --install cert-manager jetstack/cert-manager \
        --namespace cert-manager \
        --create-namespace \
        --set installCRDs=true

    # Wait for cert-manager to be ready
    kubectl -n cert-manager wait --for=condition=Ready pods --all --timeout=300s

    # Create Let's Encrypt ClusterIssuer
    cat <<EOF | kubectl apply -f -
apiVersion: cert-manager.io/v1
kind: ClusterIssuer
metadata:
  name: letsencrypt-prod
spec:
  acme:
    server: https://acme-v02.api.letsencrypt.org/directory
    email: ${EMAIL}
    privateKeySecretRef:
      name: letsencrypt-prod
    solvers:
    - http01:
        ingress:
          class: nginx
---
apiVersion: cert-manager.io/v1
kind: ClusterIssuer
metadata:
  name: letsencrypt-staging
spec:
  acme:
    server: https://acme-staging-v02.api.letsencrypt.org/directory
    email: ${EMAIL}
    privateKeySecretRef:
      name: letsencrypt-staging
    solvers:
    - http01:
        ingress:
          class: nginx
EOF

    log_info "cert-manager installed successfully"
}

# Install Prometheus Stack
install_prometheus_stack() {
    log_info "Installing Prometheus Stack..."

    helm repo add prometheus-community https://prometheus-community.github.io/helm-charts
    helm repo update

    helm upgrade --install prometheus prometheus-community/kube-prometheus-stack \
        --namespace monitoring \
        --create-namespace \
        --set grafana.adminPassword=admin \
        --set prometheus.prometheusSpec.retention=15d \
        --set prometheus.prometheusSpec.storageSpec.volumeClaimTemplate.spec.accessModes[0]=ReadWriteOnce \
        --set prometheus.prometheusSpec.storageSpec.volumeClaimTemplate.spec.resources.requests.storage=50Gi

    # Wait for Prometheus stack to be ready
    kubectl -n monitoring wait --for=condition=Ready pods --all --timeout=600s

    log_info "Prometheus Stack installed successfully"
}

# Create namespaces
create_namespaces() {
    log_info "Creating namespaces..."

    kubectl create namespace travelplatform --dry-run=client -o yaml | kubectl apply -f -
    kubectl create namespace travelplatform-staging --dry-run=client -o yaml | kubectl apply -f -

    log_info "Namespaces created successfully"
}

# Setup firewall
setup_firewall() {
    log_info "Setting up firewall..."

    case $OS in
        ubuntu|debian)
            apt-get install -y ufw
            ufw allow ssh
            ufw allow http
            ufw allow https
            ufw allow 6443/tcp  # Kubernetes API
            ufw allow 10250/tcp # Kubelet API
            ufw --force enable
            ;;
        centos|rhel|fedora)
            systemctl enable firewalld
            systemctl start firewalld
            firewall-cmd --permanent --add-service=ssh
            firewall-cmd --permanent --add-service=http
            firewall-cmd --permanent --add-service=https
            firewall-cmd --permanent --add-port=6443/tcp
            firewall-cmd --permanent --add-port=10250/tcp
            firewall-cmd --reload
            ;;
    esac

    log_info "Firewall configured successfully"
}

# Print summary
print_summary() {
    log_info "=== Setup Complete ==="
    echo ""
    echo "Server has been set up with:"
    echo "  - Docker"
    echo "  - kubectl"
    echo "  - Helm"
    echo "  - Kubernetes ($INSTALL_TYPE)"
    echo "  - NGINX Ingress Controller"
    echo "  - cert-manager with Let's Encrypt"
    echo "  - Prometheus monitoring stack"
    echo ""
    echo "Next steps:"
    echo "  1. Update DNS records to point $DOMAIN to this server's IP"
    echo "  2. Deploy the application:"
    echo "     kubectl apply -k infrastructure/k8s/overlays/production"
    echo ""
    echo "  3. Access Grafana:"
    echo "     kubectl -n monitoring port-forward svc/prometheus-grafana 3000:80"
    echo "     Default credentials: admin / admin"
    echo ""
    echo "  4. Check cluster status:"
    echo "     kubectl get nodes"
    echo "     kubectl get pods -A"
    echo ""
}

# Main installation
main() {
    log_info "Starting TravelPlatform server setup..."
    log_info "Installation type: $INSTALL_TYPE"
    log_info "Domain: $DOMAIN"
    log_info "Email: $EMAIL"

    install_docker
    install_kubectl
    install_helm

    case $INSTALL_TYPE in
        k3s)
            install_k3s
            ;;
        kubeadm)
            install_kubeadm
            ;;
        *)
            log_error "Unknown installation type: $INSTALL_TYPE"
            exit 1
            ;;
    esac

    install_nginx_ingress
    install_cert_manager
    install_prometheus_stack
    create_namespaces
    setup_firewall

    print_summary
}

main "$@"
