# Security model

## Trust boundaries

OpenAPI descriptions and API responses are untrusted input. Integration Doctor does not execute text from descriptions, follow remote `$ref` values, or expose filesystem paths outside the configured workspace through MCP.

Secrets are injected at runtime by the caller. They should never be committed to a contract. The telemetry API emits URLs and request metadata but never headers or bodies; `redactHeaders` is provided for application logs that need header names.

## Request safety

- Requests time out and accept caller cancellation.
- Transient retries are bounded.
- `POST` and `PATCH` are not retried without an explicit idempotency key.
- `Retry-After` is respected within the configured maximum delay.
- Error bodies are bounded before exposure when they are not JSON.
- Webhook signatures use constant-time comparison and a replay window.

## Non-goals

This project does not store OAuth tokens, coordinate refresh locks, isolate tenants, persist queues, or provide distributed rate limiting. Those require durable infrastructure and cannot be honestly guaranteed by a local library.

To report a vulnerability, open a private security advisory after the repository is published. Do not include active credentials or customer data.
