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

## Immediate priority — Chat management (P0)

**Goal:** Make conversations easy to find, organize, resume, and trust before adding agent-generated investigations.

### Delivery slices
1. **Find and navigate:** Search saved conversations by title; show useful empty states, timestamps, and stable active-conversation indication. Preserve keyboard and screen-reader access.
2. **Organize:** Rename, delete with confirmation, and pin/archive conversations; make actions discoverable without cluttering the list.
3. **Reliability:** Preserve drafts and selected source scope when switching conversations; prevent stale asynchronous saves from overwriting newer messages; surface save/retry failures.
4. **Scale:** Server-side search, pagination, and indexes for large histories; avoid loading full transcripts for the list.
5. **Research continuity:** Resume with evidence and source selections intact; distinguish verified citations from retained unverified passages.

### Acceptance criteria
- Searching, renaming, deleting, and resuming conversations work with keyboard and assistive technology.
- Workspace/user access checks apply to every conversation operation.
- Switching chats during a save cannot silently overwrite another conversation.
- Large histories remain responsive; regression tests cover empty, loading, error, and concurrent-update states.

## Next priority — Evidence-aware Investigation Agent (P1)

**Goal:** Turn a user goal into a bounded, auditable multi-step investigation, not a swarm of autonomous agents.

### Delivery slices
1. **Structured planner:** Produce a typed plan of objectives, permitted source scopes, filters, exclusions, and investigation steps; no company-name or prompt-specific routing conditions.
2. **Tool orchestration:** Reuse provider-independent search interfaces and normalized evidence IDs; enforce permissions, tool budgets, deadlines, retries, and cancellation.
3. **Evidence evaluation:** Verify claims against retrieved passages, identify conflicting or stale evidence, and explicitly state gaps and uncertainty.
4. **Investigation UI:** Show step-by-step progress, source provenance, tool failures, and a resumable investigation trace alongside the answer.
5. **Evaluation:** Benchmark multi-hop retrieval, citation correctness, abstention, permissions, latency, and cost against normal single-pass research.

### Later agents (P2)
- **Watchdog Agent:** Opt-in monitoring of specific projects and material evidence changes, with clear notification controls.
- **Decision Memory Agent:** Track evidence-backed decisions and revisions over time.
- **Release Readiness Agent:** Evaluate GitHub status and corroborating release evidence with explicit unknowns.
- **Action Agent:** Prepare proposed changes, drafts, or issues; require user approval before external writes.

### Agent guardrails
- Keep Quick Answer and Investigate as separate user-selectable modes.
- Treat retrieved content as untrusted instructions; never expand access beyond the user's authorized sources.
- Do not claim a task was executed or verified without a recorded tool result.
- Require explicit confirmation for consequential writes; log actions and preserve source lineage.

## Previous workstream — Gmail Intelligence (P0)

**Status:** Feature branch merged into `main` on 2026-11-08; production verification and remaining quality gaps are tracked separately. Chat management now takes priority.

**Goal:** Answer questions about Gmail conversations with reliable chronology, traceable message-level evidence, and actionable conclusions.

### Deliverables
1. **Thread-aware retrieval:** Group messages by Gmail `threadId`, order them chronologically, preserve sender/subject/date, and keep stable links to original messages. Do not treat unrelated messages as a conversation.
2. **Decision and commitment extraction:** Summarize decisions, owners, deadlines, open questions, and follow-up actions; distinguish explicit commitments from inferred suggestions.
3. **Chronological synthesis:** Detect updates, corrections, and superseded decisions within a thread. Label missing dates or ambiguous ownership rather than guessing.
4. **Grounded citations:** Every extracted decision or task links to the original email message and relevant excerpt. Clearly distinguish full-body evidence from snippets and truncated text.
5. **Search and scope:** Support relevant Gmail search filters and bounded thread expansion, honor connection permissions, and avoid fetching unrelated messages.
6. **Cross-source readiness:** Normalize Gmail evidence into the existing research answer/source contract without changing the working document retrieval path.
7. **Privacy and resilience:** Maintain read-only Gmail access; treat email text as untrusted data; redact credentials; handle pagination, rate limits, missing bodies, and revoked access.

### Incremental delivery
- **Slice A — foundation (started):** Thread grouping/chronology helper with unit tests; expose thread metadata without breaking existing message fields.
- **Slice B:** Bounded Gmail thread expansion and thread-aware search results.
- **Slice C — backend implemented, verification pending:** Opt-in decision, commitment, action, owner, and deadline analysis with source excerpts and message citations. Deterministic citation-number validation is implemented; semantic claim-to-evidence verification is still outstanding.
- **Slice D — implemented on feature branch, verification pending:** Gmail UI analysis toggle, per-message evidence excerpts, expandable thread navigation, and follow-up questions scoped to the same selected emails. Cross-source integration and persistent multi-turn history remain outstanding.
- **Slice E — tests added, not yet verified:** Backend citation-reference and request-validation tests plus Playwright Gmail thread/evidence/follow-up test. Semantic claim-to-passage verification, full benchmark runs, security review, and performance tuning remain outstanding.

### Acceptance tests
- Messages from the same thread are grouped and sorted by timestamp even if the API returns them out of order.
- Different threads never merge merely because their subjects match.
- Decisions, owners, and deadlines without explicit evidence are not presented as facts.
- Every cited message is accessible through an authorized original-message link.
- Empty, partial, and truncated threads are described accurately.
- Existing Gmail search/summarization, document retrieval, and GitHub tests remain green.

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
| 1 | Chat management | P0 | Existing conversation persistence and UI |\n| 2 | Citation verification engine | P0 | Existing citation/audit model |
| 3 | Retrieval inspector | P0 | Retrieval traces and source IDs |
| 4 | Automated RAG evaluations | P0 | Stable evidence and trace contracts |
| 5 | Investigation Agent | P1 | Structured planning, retrieval, citation verification |\n| 6 | Source collections | P1 | Document metadata and workspace RBAC |
| 7 | Document comparison | P1 | Source versioning |
| 8 | Reports and exports | P1 | Verified citations and report model |
| 9 | Scheduled source sync | P2 | Safe ingestion, versioning, background jobs |

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
