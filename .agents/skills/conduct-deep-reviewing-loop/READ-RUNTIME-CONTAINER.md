# Readiness Subdocument: Container Runtimes & Infrastructure Prerequisites

## Domain Audit Checklist

### 1. Base Image Safety & Construction
- [ ] Image Pinning: Verify container base images use explicit cryptographic SHA256 digests or specific version tags. Reject generic `latest` tags.
- [ ] Multi-Stage Builds: Confirm production binaries are compiled in builder stages and copied into minimal execution distroless/scratch environments.

### 2. Runtime Security Principles
- [ ] Non-Root Execution: Ensure `USER <non-root-uid>` is explicitly set in Dockerfiles. Reject containers running as root (`UID 0`).
- [ ] Read-Only Root Filesystem: Verify application designs permit mounting the root container filesystem as read-only (`readOnlyRootFilesystem: true`), delegating ephemeral writes to explicit `emptyDir` or `/tmp` mounts.

### 3. Resource Allocations & Signals
- [ ] Explicit Resource Limits: Verify CPU and Memory requests and limits are declared in deployment manifests to prevent Node OOM conditions.
- [ ] Process Signal Forwarding: Ensure container entrypoints execute application binaries directly or use init wrappers (`tini`, `dumb-init`) to correctly forward `SIGTERM` and `SIGINT` signals.

## Concrete Anti-Patterns

### Anti-Pattern 1: Unpinned Root Container Execution

```dockerfile
# BAD: Base image tag floating, runs as root, installs unnecessary toolchains
FROM ubuntu:latest
RUN apt-get update && apt-get install -y python3 gcc
COPY . /app
CMD ["python3", "/app/main.py"]

# GOOD: Multi-stage, pinned digest, minimal runtime, non-root user
FROM python:3.11-slim@sha256:d17c... AS builder
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

FROM python:3.11-slim@sha256:d17c... AS runner
RUN groupadd -g 10001 appgroup && useradd -u 10001 -g appgroup appuser
WORKDIR /app
COPY --from=builder /usr/local/lib/python3.11/site-packages /usr/local/lib/python3.11/site-packages
COPY main.py .
USER 10001:10001
ENTRYPOINT ["python3", "main.py"]
```

## Failure Modes & Mitigations

- Uncontrolled OOM Process Termination: Set Kubernetes memory limits equal to memory requests to ensure deterministic QoS class placement.
- Zombie Process Accumulation: Ensure application entrypoints handle `SIGCHLD` signals or execute with PID 1 init managers.
