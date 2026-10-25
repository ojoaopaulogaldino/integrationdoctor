# Architecture and decisions

## Why contract-first

An OpenAPI contract is an imperfect but useful common input for humans, CI, code generators, and coding agents. Integration Doctor builds one normalized operation model and reuses it across analysis, planning, diffing, generation, CLI, and MCP. This prevents agent output from silently disagreeing with the CI gate.

## Reliability policy

Retries are semantic, not merely numeric. Reads and naturally idempotent HTTP methods may retry transient failures. Writes require an idempotency key. Server guidance through `Retry-After` takes precedence over exponential backoff, subject to a maximum delay. Every attempt emits an event suitable for OpenTelemetry adapters without coupling the core to a vendor.

## Agent boundary

MCP intentionally exposes read-only inspection. Generation remains a human-invoked CLI operation because writing files is a materially different capability. Tool descriptions call planning output a heuristic and tool inputs cannot escape the declared workspace through `..` segments or symlinks.

## Roadmap

1. Resolve internal JSON Pointers and classify schema variance recursively.
2. Generate operation-level convenience methods and runtime validators.
3. Add deterministic mock scenarios and contract conformance probes.
4. Add an OpenTelemetry adapter and distributed rate-limit interface.
5. Publish an npm package and reproducible container image after public review.
