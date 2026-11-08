# Atlas Product Roadmap

> Status: Proposed roadmap. This document describes future work, not features confirmed as shipped.
> Updated: 2026-11-08

## Vision
Make Atlas a trustworthy, evidence-first research workspace that can explain where answers come from, measure their quality, organize sources, and deliver reusable research outputs.

## Principles
- Extend existing evidence review and research functionality rather than duplicating it.
- Every cited claim should be traceable to a real retrieved passage.
- Distinguish source evidence, model inference, and unsupported claims.
- Honor workspace permissions and source filters.
- Keep evaluation reproducible and expose meaningful errors.
- Ship incrementally with tests, instrumentation, and accessible UI.

## Phase 1 — Trust (P0)

### 1. Claim-level citation verification engine
**Goal:** Show whether each substantive answer claim is supported by its cited evidence.

**Scope**
- Extract atomic claims from generated answers and link them to cited passage IDs.
- Classify claims as **supported**, **partially supported / needs qualification**, **unsupported**, or **not assessed**; never present automated judgments as guarantees.
- Provide an interactive evidence panel: click a claim to view exact source text, document title, link, and passage location.
- Highlight conflicting or missing evidence; permit user feedback on classifications.
- Reuse existing citation audit/evidence review data where possible.

**Acceptance criteria**
- Claims and citations resolve to stored passages with stable IDs.
- Unsupported claims are clearly differentiated from claims without sufficient evidence.
- A user can navigate from a claim to its source and back with keyboard and screen reader support.
- Regression tests cover correct, mismatched, absent, and contradictory citations.

### 2. Retrieval inspector
**Goal:** Make retrieval behavior transparent and debuggable.

**Scope**
- Show search query, active source filters, selected collections, retrieved chunks, document IDs, ranks, and available relevance scores.
- Differentiate retrieved passages from passages actually cited in the answer.
- Expose latency and retrieval/indexing failures without leaking secrets or cross-workspace content.
- Provide an optional developer/debug view with a downloadable trace.

**Acceptance criteria**
- Trace is linked to the answer/request and reflects the actual retrieval pipeline.
- Scores are labeled with their meaning; no invented confidence percentages.
- Workspace permissions and sensitive metadata redaction are enforced.
- Tests verify filters, ordering, trace persistence, and access control.

## Phase 2 — Quality (P0)

### 3. Automated RAG evaluation and regression suite
**Goal:** Detect answer-quality regressions before shipping retrieval or prompt changes.

**Scope**
- Store benchmark questions, expected factual points, acceptable answers, and expected source IDs/passages.
- Run evaluations against selected workspace snapshots and retrieval configurations.
- Measure retrieval relevance/recall, citation accuracy, factual support, multi-source synthesis, and follow-up context handling.
- Include explicit abstention tests for unsupported or out-of-scope questions.
- Track trends, failure examples, and changes between runs; gate releases on agreed thresholds.

**Acceptance criteria**
- Evaluations are reproducible with versioned datasets/configurations.
- Reports separate deterministic checks from model-graded assessments.
- CI can run a small stable smoke suite; larger suites can run on demand.
- No private document content is exposed in public CI artifacts.

## Phase 3 — Organization (P1)

### 4. Source collections
**Goal:** Organize research material and constrain retrieval intentionally.

**Scope**
- Create, rename, and delete collections; add/remove documents and saved URLs.
- Filter research to one or multiple collections, with visible scope in the conversation.
- Support collections such as Backend, Frontend, Security, and Architecture.
- Apply existing workspace access controls to all collection operations.

**Acceptance criteria**
- Collection filters are respected in retrieval and citations.
- Moving or removing a document updates collection membership predictably.
- Empty collections and missing permissions have clear UI states.
- Tests cover membership, filtering, and authorization.

### 5. Document comparison and change detection
**Goal:** Explain what changed between source versions and which research conclusions may be affected.

**Scope**
- Compare two documents or versions side by side with highlighted additions, removals, and changed passages.
- Retain provenance, timestamps, and links to original versions.
- Identify citations pointing to outdated passages and flag affected answers for review.
- Clearly distinguish textual differences from inferred semantic changes.

**Acceptance criteria**
- Diffs reference the correct versions and source locations.
- Reindexing preserves or records citation lineage where possible.
- Users can review changed claims without silently rewriting prior answers.
- Tests cover unchanged, modified, removed, and reordered content.

## Phase 4 — Productivity (P1)

### 6. Research reports and exports
**Goal:** Turn research conversations into reusable deliverables.

**Scope**
- Generate a structured report with title, summary, findings, methodology, limitations, citations, and source list.
- Let users review and edit the draft before export.
- Export Markdown and PDF; preserve clickable source links and evidence references.
- Make unsupported or unverified claims visible in the report.

**Acceptance criteria**
- Exports preserve citation/source mapping and readable formatting.
- Report contents match the reviewed draft.
- Export respects document permissions and handles missing sources.
- Snapshot tests cover Markdown/PDF output and special characters.

## Phase 5 — Automation (P2)

### 7. Scheduled source synchronization
**Goal:** Keep saved public web sources current without manual reimport.

**Scope**
- Configure per-source refresh schedules and manual refresh.
- Re-fetch permitted URLs safely, observe rate limits, and detect changed content using hashes or comparable signals.
- Reindex only when content changes; retain version history and last-success/last-error timestamps.
- Notify users when important sources change or when synchronization repeatedly fails.
- Protect against SSRF, unsafe redirects, excessive crawling, and inaccessible content.

**Acceptance criteria**
- Unchanged sources do not create duplicate indexed passages.
- Failed fetches do not delete the last known good version.
- Refresh jobs are observable, retryable, and permission-scoped.
- Tests cover redirects, timeouts, changed pages, and reindex failures.

## Implementation sequence
| Order | Feature | Priority | Depends on |
| --- | --- | --- | --- |
| 1 | Citation verification engine | P0 | Existing citation/audit model |
| 2 | Retrieval inspector | P0 | Retrieval traces and source IDs |
| 3 | Automated RAG evaluations | P0 | Stable evidence and trace contracts |
| 4 | Source collections | P1 | Document metadata and workspace RBAC |
| 5 | Document comparison | P1 | Source versioning |
| 6 | Reports and exports | P1 | Verified citations and report model |
| 7 | Scheduled source sync | P2 | Safe ingestion, versioning, background jobs |

## Suggested initial vertical slice
**Question:** “Is FastAPI BackgroundTasks suitable for long-running distributed jobs? Explain the limitations using my sources.”

1. Retrieve and show the actual relevant FastAPI passages.
2. Generate an answer with citations and atomic claim-to-passage mappings.
3. Label a supported claim (background tasks execute after response), a claim needing qualification (suitability for long-running work), and an unsupported claim (guaranteed exactly-once execution), subject to the retrieved evidence.
4. Let the user open evidence for each claim and inspect the retrieval trace.
5. Add benchmark cases for correct citations, wrong citations, no evidence, and follow-up questions.

## Quality checklist for every milestone
- Backend and frontend tests, including permission boundaries.
- End-to-end coverage for core user flows and keyboard accessibility.
- Clear loading, empty, failure, and retry states.
- Observability for latency, failures, and usage.
- No fabricated evidence, scores, citations, or success states.
- Documentation, migration notes where applicable, and rollout/rollback plan.

## Open decisions
- Where should claim-to-passage judgments be persisted and versioned?
- Which evaluation metrics can be deterministic, and which require human/model review?
- How long should retrieval traces and source versions be retained?
- Which background job system should support scheduled sync?
- What collection-sharing and report-sharing permissions are needed?
