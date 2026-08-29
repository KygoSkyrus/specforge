# SpecForge Deployment Guide

Step-by-step production deployment procedures.

---

## Table of Contents

- [Pre-Deployment Checklist](#pre-deployment-checklist)
- [Infrastructure Setup](#infrastructure-setup)
- [Application Deployment](#application-deployment)
- [Post-Deployment Verification](#post-deployment-verification)
- [Rollback Procedure](#rollback-procedure)
- [Monitoring & Alerts](#monitoring--alerts)

---

## Pre-Deployment Checklist

**Code Quality**
- [ ] All tests passing (`pnpm test`, `pnpm test:api`, `pnpm test:e2e`)
- [ ] No lint errors (`pnpm lint`)
- [ ] No type errors (`pnpm typecheck`)
- [ ] Code coverage >80%
- [ ] No secrets in code (`git grep -i "api.key\|secret\|password"`)

**Security**
- [ ] Dependency audit clean (`pnpm audit`)
- [ ] SAST scan passed (Semgrep)
- [ ] Container image scan passed (Trivy)
- [ ] Secret rotation done (JWT, encryption keys)

**Documentation**
- [ ] CHANGELOG updated
- [ ] API documentation current
- [ ] Runbook reviewed
- [ ] Migration plan documented

**Data**
- [ ] Database backup taken
- [ ] Migration tested on staging
- [ ] Rollback plan documented

---

## Infrastructure Setup

### 1. Set Up Cloud Resources (First Time Only)

**Azure Resources**

```bash
# Create resource group
az group create \
  --name specforge-prod \
  --location eastus

# Create PostgreSQL server
az postgres server create \
  --resource-group specforge-prod \
  --name specforge-db \
  --location eastus \
  --sku-name B_Gen5_2 \
  --storage-size 51200 \
  --admin-user postgres \
  --admin-password <strong-password>

# Enable encryption at rest
az postgres server update \
  --resource-group specforge-prod \
  --name specforge-db \
  --infrastructure-encryption Enabled

# Create Redis cache
az redis create \
  --resource-group specforge-prod \
  --name specforge-redis \
  --location eastus \
  --sku Basic \
  --vm-size c0

# Create Azure Container Registry
az acr create \
  --resource-group specforge-prod \
  --name specforgeprod \
  --sku Basic

# Create AKS cluster
az aks create \
  --resource-group specforge-prod \
  --name specforge-prod-aks \
  --node-count 3 \
  --vm-set-type VirtualMachineScaleSets \
  --load-balancer-sku standard \
  --enable-managed-identity \
  --network-plugin azure
```

### 2. Set Up Kubernetes Cluster

```bash
# Get AKS credentials
az aks get-credentials \
  --resource-group specforge-prod \
  --name specforge-prod-aks

# Verify connection
kubectl cluster-info
kubectl get nodes

# Create namespaces
kubectl create namespace specforge
kubectl create namespace ingress-nginx
kubectl create namespace cert-manager
kubectl create namespace monitoring

# Label namespace for monitoring
kubectl label namespace specforge app=specforge

# Install Ingress Controller
helm repo add ingress-nginx https://kubernetes.github.io/ingress-nginx
helm install nginx ingress-nginx/ingress-nginx \
  --namespace ingress-nginx \
  --values infra/helm/ingress-values.yaml

# Install cert-manager
helm repo add jetstack https://charts.jetstack.io
helm install cert-manager jetstack/cert-manager \
  --namespace cert-manager \
  --set installCRDs=true

# Install Prometheus
helm repo add prometheus-community https://prometheus-community.github.io/helm-charts
helm install prometheus prometheus-community/kube-prometheus-stack \
  --namespace monitoring \
  --values infra/helm/prometheus-values.yaml
```

### 3. Set Up Secrets

```bash
# Create Kubernetes secrets
kubectl create secret generic specforge-secrets \
  -n specforge \
  --from-literal=database-url="postgresql://postgres:PASSWORD@specforge-db.postgres.database.azure.com:5432/specforge" \
  --from-literal=redis-url="rediss://default:PASSWORD@specforge-redis.redis.cache.windows.net:6379" \
  --from-literal=jwt-secret="$(openssl rand -base64 32)" \
  --from-literal=encryption-key="$(openssl rand -hex 32)" \
  --from-literal=openai-api-key="sk-proj-xxxxx"

# Verify
kubectl get secret specforge-secrets -n specforge -o yaml
```

### 4. Configure DNS & TLS

```bash
# Get public IP of ingress
INGRESS_IP=$(kubectl get svc -n ingress-nginx nginx-ingress-nginx-controller -o jsonpath='{.status.loadBalancer.ingress[0].ip}')

# Point DNS records to INGRESS_IP
# DNS A records:
# specforge.app        -> INGRESS_IP
# www.specforge.app    -> INGRESS_IP
# api.specforge.app    -> INGRESS_IP

# Create certificate issuer
kubectl apply -f infra/k8s/cert-issuer.yaml

# Verify certificate provisioning
kubectl get certificate -n specforge
kubectl describe certificate specforge-tls-cert -n specforge
```

---

## Application Deployment

### 1. Build & Push Images

```bash
# Login to container registry
az acr login --name specforgeprod

# Build images (CI/CD does this, but for manual deployment:)
docker build -f apps/api/Dockerfile.production -t specforgeprod.azurecr.io/api:v1.0.0 .
docker build -f apps/web/Dockerfile.production -t specforgeprod.azurecr.io/web:v1.0.0 .
docker build -f apps/worker/Dockerfile.production -t specforgeprod.azurecr.io/worker:v1.0.0 .

# Push images
docker push specforgeprod.azurecr.io/api:v1.0.0
docker push specforgeprod.azurecr.io/web:v1.0.0
docker push specforgeprod.azurecr.io/worker:v1.0.0
```

### 2. Run Database Migrations

```bash
# Create migration pod (one-off job)
kubectl run -it --rm specforge-migrate \
  --image=specforgeprod.azurecr.io/api:v1.0.0 \
  --serviceaccount=default \
  -n specforge \
  -- npx prisma migrate deploy

# Verify migration success
kubectl logs specforge-migrate -n specforge | tail -20
```

### 3. Deploy Application

```bash
# Update deployment images
kubectl set image deployment/specforge-api \
  api=specforgeprod.azurecr.io/api:v1.0.0 \
  -n specforge

kubectl set image deployment/specforge-web \
  web=specforgeprod.azurecr.io/web:v1.0.0 \
  -n specforge

kubectl set image deployment/specforge-worker \
  worker=specforgeprod.azurecr.io/worker:v1.0.0 \
  -n specforge

# Watch rollout progress
kubectl rollout status deployment/specforge-api -n specforge
kubectl rollout status deployment/specforge-web -n specforge
kubectl rollout status deployment/specforge-worker -n specforge
```

### 4. Deploy Configuration

```bash
# Apply Ingress
kubectl apply -f infra/k8s/ingress.yaml

# Apply monitoring
kubectl apply -f infra/k8s/monitoring.yaml

# Apply network policies
kubectl apply -f infra/k8s/network-policy.yaml

# Verify
kubectl get all -n specforge
```

---

## Post-Deployment Verification

### 1. Health Checks

```bash
# API health
curl https://api.specforge.app/api/v1/health

# Expected response:
# {
#   "status": "ok",
#   "database": "connected",
#   "redis": "connected",
#   "uptime": "2.5 minutes"
# }

# Pod readiness
kubectl get pods -n specforge -o wide
# All pods should show "Ready 1/1" and "Running"
```

### 2. Smoke Tests

```bash
# Test login flow
curl -X POST https://api.specforge.app/api/v1/auth/dev-login \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com"}'

# Test creating spec
curl -X POST https://api.specforge.app/api/v1/specs \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Test Spec",
    "projectId": "test-project"
  }'

# Test web UI
curl https://specforge.app | grep -q "SpecForge" && echo "✓ Web OK" || echo "✗ Web failed"
```

### 3. Performance Baseline

```bash
# Run synthetic load test
k6 run test/load/specs.js --vus 10 --duration 2m

# Expected results:
# - API p95 latency < 1s
# - Error rate < 0.1%
# - Throughput > 50 req/s
```

### 4. Monitoring Dashboard

```bash
# Port-forward Grafana
kubectl port-forward -n monitoring svc/prometheus-grafana 3000:80

# Access at http://localhost:3000
# Default: admin / prom-operator
# Verify dashboards:
# - Kubernetes cluster
# - Pod resource usage
# - API performance
# - Database connections
```

---

## Rollback Procedure

**If deployment fails:**

```bash
# Rollback to previous version
kubectl rollout undo deployment/specforge-api -n specforge
kubectl rollout undo deployment/specforge-web -n specforge
kubectl rollout undo deployment/specforge-worker -n specforge

# Verify rollback
kubectl rollout status deployment/specforge-api -n specforge

# Check logs
kubectl logs -f deployment/specforge-api -n specforge --tail=100
```

**If database migration fails:**

```bash
# Restore from backup
pg_restore --host=specforge-db.postgres.database.azure.com \
  --username=postgres@specforge-db \
  --dbname=specforge \
  backup-20250829-120000.sql

# Verify data
psql -h specforge-db.postgres.database.azure.com -U postgres@specforge-db -c "SELECT COUNT(*) FROM specs"

# Re-run migration (if schema issue)
# Or deploy previous API image
kubectl set image deployment/specforge-api \
  api=specforgeprod.azurecr.io/api:v0.9.9 \
  -n specforge
```

---

## Monitoring & Alerts

### Key Metrics to Monitor (First 24 Hours)

```
Pod Status          → All Running, Ready 1/1
CPU Usage           → Should be < 50%
Memory Usage        → Should be < 70%
API Response Time   → p95 < 1s
Error Rate          → < 0.5%
Database Connections → < 10 of 20
Redis Memory        → < 1GB
Queue Backlog       → < 50 jobs
TLS Certificate     → Valid, expires in ~90 days
```

### Prometheus Dashboards

```
# API Performance
rate(http_request_duration_seconds_count[5m])                           # RPS
histogram_quantile(0.95, http_request_duration_seconds_bucket)          # p95 latency
rate(http_request_duration_seconds_count{status=~"5.."}[5m])            # Error rate

# Resource Usage
container_cpu_usage_seconds_total{pod="specforge-api-xxx"}              # CPU
container_memory_usage_bytes{pod="specforge-api-xxx"}                   # Memory
node_memory_MemAvailable_bytes                                          # Node memory

# Database
pg_stat_activity_count{state="active"}                                  # Active connections
rate(pg_stat_statements_calls[5m])                                      # Query rate
```

### Alert Triggers (Configure in Prometheus)

```yaml
- alert: APIHighErrorRate
  expr: rate(http_requests_total{status=~"5.."}[5m]) > 0.01  # > 1% error rate
  for: 5m
  action: page

- alert: DatabaseConnPoolExhausted
  expr: pg_stat_activity_count{state="active"} > 18
  for: 2m
  action: page

- alert: HighMemoryUsage
  expr: container_memory_usage_bytes{pod=~"specforge-.*"} > 1073741824  # > 1GB
  for: 10m
  action: warn

- alert: TLSCertificateExpiring
  expr: certmanager_certificate_expiration_timestamp_seconds - time() < 604800  # < 7 days
  for: 1h
  action: warn
```

### Incident Response

**If alert triggers:**

1. Check pod logs: `kubectl logs deployment/specforge-api -n specforge --tail=50`
2. Check resource usage: `kubectl top pods -n specforge`
3. Check database: `SELECT * FROM pg_stat_activity WHERE state != 'idle'`
4. Escalate to on-call engineer
5. Document incident in postmortem template

