# Atlas reliability and retrieval verification

This document tracks engineering acceptance criteria. A checklist is not evidence that a control is implemented.

## Retrieval
- [x] PostgreSQL native full-text ranking and pgvector hybrid candidates (existing implementation in `backend/app/retrieval.py`).
- [x] SQLite FTS fallback (existing implementation).
- [x] Deterministic Recall@K, Precision@K and MRR@K scoring utility.
- [ ] Curated, versioned relevance judgments and real database benchmark runs.
- [ ] Query latency p50/p95, CPU and memory comparisons for SQLite/Postgres at multiple corpus sizes.
- [ ] Compare candidate fusion weights against held-out relevance labels.

## Citations
- [x] Reference, numeric, negation and lexical checks (existing).
- [ ] Semantic entailment evaluation with calibrated abstention and independent gold labels.
- [ ] Adversarial tests: fabricated facts, conflicting sources, negated claims, prompt injection.

## Security
- [ ] Cross-workspace document, chunk, search, conversation and connector authorization tests.
- [ ] OAuth scope and refresh-token lifecycle review per provider.
- [ ] SSRF protections for all server-side URL fetchers, including redirects and private IPs.
- [ ] Upload size, MIME, parser sandbox and decompression-bomb tests.
- [ ] Authenticated rate limits, secure cookie configuration and production secret management review.

## Operations
- [ ] Worker lease concurrency, crash recovery and idempotency load tests.
- [ ] Queue-depth, lease age, retry count and terminal-failure metrics.
- [ ] Provider contract tests for auth expiry, pagination, throttling and partial outages.
- [ ] Browser E2E: sign-in, workspace isolation, upload, indexing, ask and citation navigation.

Do not enable public production access solely on the basis of this checklist.
