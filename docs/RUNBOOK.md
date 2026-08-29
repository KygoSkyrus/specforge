# SpecForge Production Runbook

Essential operations for production support.

---

## Table of Contents
- [Startup & Shutdown](#startup--shutdown)
- [Monitoring & Alerts](#monitoring--alerts)
- [Database Operations](#database-operations)
- [Incident Response](#incident-response)
- [Performance Tuning](#performance-tuning)
- [Disaster Recovery](#disaster-recovery)

---

## Startup & Shutdown

### Cold Start (First Deploy)

```bash
# 1. Verify prerequisites
kubectl get namespace specforge
kubectl get secret specforge-secrets -n specforge

# 2. Apply infrastructure
kubectl apply -f infra/k8s/namespace.yaml
kubectl apply -f infra/k8s/api-deployment.yaml
kubectl apply -f infra/k8s/web-deployment.yaml
kubectl apply -f infra/k8s/worker-deployment.yaml
kubectl apply -f infra/k8s/ingress.yaml

# 3. Wait for readiness
kubectl rollout status deployment/specforge-api -n specforge
kubectl rollout status deployment/specforge-web -n specforge

# 4. Verify health
curl https://api.specforge.app/api/v1/health

# 5. Check logs
kubectl logs -f deployment/specforge-api -n specforge --tail=100
```

### Graceful Shutdown

```bash
# Drain all jobs from worker queue
kubectl exec -it deployment/specforge-worker -n specforge -- \
  node -e "require('bullmq').Queue('generate-spec', {connection: {host: 'redis'}}).drain()"

# Scale down gradually
kubectl scale deployment specforge-api --replicas=1 -n specforge
sleep 30

# Terminate
kubectl delete deployment specforge-api -n specforge

# Verify
kubectl get pods -n specforge
```

---

## Monitoring & Alerts

### Key Metrics to Watch

```
# CPU / Memory
container_cpu_usage_seconds_total{pod="specforge-api-xxx"}
container_memory_usage_bytes{pod="specforge-api-xxx"}

# API Latency
http_request_duration_seconds{endpoint="/api/v1/specs"}
  p50: <200ms
  p95: <1s
  p99: <2s

# Database Connections
pg_stat_activity_count{state="active"} # Should be < 18 (limit: 20)

# AI Generation Queue
bullmq_queue_waiting{queue="generate-spec"}  # Backlog indicator
bullmq_job_duration_seconds{queue="generate-spec"}  # Job latency

# Error Rate
rate(http_request_duration_seconds_count{status=~"5.."}[5m])  # Should be < 0.5%

# AI Cost
ai_run_monthly_cost_usd / ai_run_monthly_budget_usd  # Alert if > 0.8
```

### Prometheus Queries

```promql
# API response time (95th percentile)
histogram_quantile(0.95, http_request_duration_seconds_bucket{endpoint="/api/v1/specs"})

# Error rate
rate(http_request_duration_seconds_count{status=~"5.."}[5m]) / rate(http_request_duration_seconds_count[5m])

# Queue backlog (if exceeds 100 jobs)
bullmq_queue_waiting{queue="generate-spec"} > 100

# Database connection pool utilization
pg_stat_activity_count{state="active"} / 20

# AI cost burn rate (daily run-rate)
rate(ai_run_monthly_cost_usd[1d]) * 30
```

### Setting Up Alerts

```yaml
# Add to infra/k8s/monitoring.yaml
- alert: HighAPILatency
  expr: histogram_quantile(0.95, http_request_duration_seconds_bucket) > 2
  for: 5m
  annotations:
    summary: "API p95 latency is {{ $value }}s"
    # Trigger PagerDuty webhook
    
- alert: DatabasePoolExhausted
  expr: pg_stat_activity_count{state="active"} > 18
  for: 2m
  annotations:
    summary: "DB connection pool near capacity"
    # Trigger critical alert
```

### Grafana Dashboards

Essential dashboards to create:

1. **System Health**
   - Pod CPU/Memory
   - Network I/O
   - Disk usage

2. **API Performance**
   - Response time by endpoint
   - Error rate
   - Request rate

3. **Background Jobs**
   - Queue depth
   - Job duration
   - Failure rate

4. **Database**
   - Connection pool
   - Query latency
   - Lock contention

5. **AI Operations**
   - Token usage by model
   - Cost burn rate
   - Error rate

---

## Database Operations

### Backup & Restore

```bash
# Manual backup
PGPASSWORD=$POSTGRES_PASSWORD pg_dump \
  -h specforge-db.postgres.database.azure.com \
  -U postgres@specforge-db \
  specforge > backup-$(date +%Y%m%d-%H%M%S).sql

# Restore from backup
psql -h specforge-db.postgres.database.azure.com \
  -U postgres@specforge-db \
  specforge < backup-20260829-120000.sql

# Azure automatic backups (enabled by default)
# Retention: 7 days (free), 35 days (paid)
```

### Running Migrations

```bash
# Before migration: backup
kubectl exec -it deployment/specforge-api -n specforge -- \
  npm run db:backup

# Run migration
kubectl exec -it deployment/specforge-api -n specforge -- \
  npx prisma migrate deploy

# Verify success
kubectl logs deployment/specforge-api -n specforge | grep "Migration" | tail -5

# Rollback (if needed)
# Use backup, or manually revert schema
```

### Query Optimization

```sql
-- Find slow queries
SELECT query, calls, mean_exec_time, max_exec_time
FROM pg_stat_statements
WHERE mean_exec_time > 100  -- > 100ms
ORDER BY mean_exec_time DESC
LIMIT 20;

-- Check table sizes
SELECT schemaname, tablename, pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename))
FROM pg_tables
ORDER BY pg_total_relation_size(schemaname||'.'||tablename) DESC;

-- Analyze missing indexes
SELECT * FROM pg_stat_user_tables
WHERE seq_scan > 1000;  -- Indicates missing index
```

---

## Incident Response

### API is Down

**1. Assess**
```bash
# Check pod status
kubectl get pods -n specforge -l component=api

# Check logs
kubectl logs deployment/specforge-api -n specforge --tail=50 --all-containers

# Check events
kubectl describe pod specforge-api-xxx -n specforge
```

**2. Triage**
- Pod CrashLoopBackOff → Check application logs for startup error
- Pod Pending → Resource shortage or node issues
- Pod Running but unhealthy → Check liveness probe logs

**3. Recover**
```bash
# Restart pod
kubectl rollout restart deployment/specforge-api -n specforge

# Check health
kubectl rollout status deployment/specforge-api -n specforge

# If still down, rollback to previous version
kubectl rollout undo deployment/specforge-api -n specforge
```

### Database is Slow

**1. Check**
```bash
# Connection pool
SELECT datname, count(*) as connections FROM pg_stat_activity GROUP BY datname;

# Running queries
SELECT query, state, query_start FROM pg_stat_activity WHERE state != 'idle';

# Index usage
SELECT schemaname, tablename, indexname, idx_blks_hit / (idx_blks_hit + idx_blks_read) AS hit_ratio
FROM pg_statio_user_indexes
WHERE idx_blks_read > 0
ORDER BY hit_ratio ASC;
```

**2. Mitigate**
```bash
# Kill long-running query (if blocking)
SELECT pg_terminate_backend(pid) FROM pg_stat_activity 
WHERE query_start < now() - interval '10 minutes' AND state != 'idle';

# Scale up read replicas
az postgres server replica create --resource-group specforge --server specforge-db --name specforge-db-replica
```

**3. Optimize**
- Add index on frequently filtered columns
- Increase `shared_buffers` (PostgreSQL setting)
- Upgrade compute tier if CPU-bound

### Workers are Stuck (Queue Not Processing)

**1. Check**
```bash
# Peek queue depth
redis-cli -h redis.specforge.svc.cluster.local LLEN bull:generate-spec:wait

# Check worker status
kubectl logs deployment/specforge-worker -n specforge | grep -i "error\|failed"

# Worker process
ps aux | grep worker
```

**2. Recover**
```bash
# Restart worker
kubectl rollout restart deployment/specforge-worker -n specforge

# Drain and requeue jobs
kubectl exec -it deployment/specforge-worker -n specforge -- \
  node -e "new (require('bullmq')).Queue('generate-spec', {connection: {host: 'redis'}}).drain()"

# Monitor recovery
kubectl logs -f deployment/specforge-worker -n specforge
```

### Out of Memory (OOM)

**1. Detect**
```bash
# Check events
kubectl get events -n specforge --sort-by='.lastTimestamp' | grep OOM

# Check pod metrics
kubectl top pod -n specforge -l component=api
```

**2. Respond**
```bash
# Increase memory limit
kubectl set resources deployment specforge-api \
  --limits=memory=2Gi \
  -n specforge

# Increase HPA memory threshold
kubectl patch hpa specforge-api-hpa -n specforge -p '{"spec":{"metrics":[{"type":"Resource","resource":{"name":"memory","target":{"type":"Utilization","averageUtilization":70}}}]}}'

# Identify memory leak
kubectl exec -it pod/specforge-api-xxx -n specforge -- node --prof
# Analyze with v8-profiler
```

---

## Performance Tuning

### API Response Time

Goal: p95 latency < 1 second

```typescript
// Add response time middleware (if not using Prometheus metrics already)
app.use((req, res, next) => {
  const start = Date.now()
  res.on('finish', () => {
    const duration = Date.now() - start
    if (duration > 1000) {
      logger.warn(`Slow request: ${req.method} ${req.path} took ${duration}ms`)
    }
  })
  next()
})

// Profile slow endpoints
app.get('/api/v1/specs/:id', async (req, res) => {
  const timer = performance.now()
  const spec = await this.specs.get(req.params.id)  // Measure this
  logger.info(`Spec retrieval took ${performance.now() - timer}ms`)
  res.json(spec)
})
```

### Database Query Optimization

```sql
-- Add index on frequently filtered columns
CREATE INDEX idx_specs_project_status ON specs(project_id, status)
  WHERE deleted_at IS NULL;

-- Analyze query plan
EXPLAIN ANALYZE
SELECT * FROM specs WHERE project_id = $1 AND status = 'draft';
```

### Cache Strategy

```typescript
// Redis cache for specs (5-min TTL)
async getSpec(specId: string): Promise<Spec> {
  const cached = await this.redis.get(`spec:${specId}`)
  if (cached) return JSON.parse(cached)
  
  const spec = await this.prisma.spec.findUnique({ where: { id: specId } })
  await this.redis.setex(`spec:${specId}`, 300, JSON.stringify(spec))
  return spec
}

// Invalidate on update
async updateSpec(specId: string, dto: UpdateSpecDto) {
  const spec = await this.prisma.spec.update({...})
  await this.redis.del(`spec:${specId}`)
  return spec
}
```

---

## Disaster Recovery

### Data Loss Scenario

**Recovery Time Objective (RTO):** 1 hour  
**Recovery Point Objective (RPO):** 15 minutes

```bash
# 1. Restore from latest backup
pg_restore --host=specforge-db.postgres.database.azure.com \
  --port=5432 \
  --username=postgres@specforge-db \
  --dbname=specforge \
  backup-20260829-120000.sql

# 2. Verify data integrity
SELECT COUNT(*) FROM specs;
SELECT COUNT(*) FROM requirements;

# 3. Restart API
kubectl rollout restart deployment/specforge-api -n specforge

# 4. Run database health checks
npm run db:health-check
```

### Multi-Region Failover

For HA setup (future):

```bash
# Primary region down
# 1. Promote read replica to primary
gcloud sql instances promote-replica specforge-db-replica

# 2. Update DNS to secondary region
gcloud dns record-sets update api.specforge.app \
  --rrdatas=api-secondary.specforge.app \
  --ttl=60

# 3. Verify traffic
curl https://api.specforge.app/api/v1/health
```

### Secrets Rotation

```bash
# 1. Generate new secret
openssl rand -base64 32 > /tmp/new-jwt-secret

# 2. Update Kubernetes secret
kubectl create secret generic specforge-secrets-v2 \
  --from-literal=jwt-secret=$(cat /tmp/new-jwt-secret) \
  -n specforge

# 3. Update deployment
kubectl patch deployment specforge-api -n specforge \
  -p '{"spec":{"template":{"spec":{"containers":[{"name":"api","env":[{"name":"JWT_SECRET","valueFrom":{"secretKeyRef":{"name":"specforge-secrets-v2"}}}]}]}}}}'

# 4. Verify
kubectl rollout status deployment/specforge-api -n specforge
```

