# Atlas Agent Studio — initial milestone

Agent Studio provides workspace-scoped saved research agent configurations, bounded read-only research execution, and persistent run traces.

## API

- GET /api/workspaces/{workspaceId}/agents — list saved agents (viewer)
- POST /api/workspaces/{workspaceId}/agents — create agent (editor)
- GET /api/workspaces/{workspaceId}/agents/{agentId}/runs — inspect recent runs (viewer)
- POST /api/workspaces/{workspaceId}/agents/{agentId}/runs — enqueue research (editor)
- POST /api/workspaces/{workspaceId}/agents/{agentId}/runs/{runId}/cancel — cancel queued or processing research (editor)

Requests use existing session authentication and workspace RBAC. Runs plan up to three bounded retrieval queries, retrieve only ready documents from the requested workspace, deduplicate at most eight evidence passages, and generate grounded answers through Atlas's existing RAG engine. Each run also includes a document-to-passage provenance graph, visible in Agent Studio. Graph edges indicate containment, not semantic entailment. Source text is untrusted. Agent instructions are stored but **not used as privileged prompts**.

## Limitations and next steps

- Runs are now persisted as queued jobs and dispatched by the existing worker loop, with generation/lease-based claiming and workspace permission revalidation at execution. Cancellation invalidates the generation of queued/processing runs and workers check ownership at checkpoints. It does not forcibly interrupt an in-flight model request. Admission currently caps active runs at five per workspace and two per user, but this is not an atomic concurrency-safe quota. Research claims are limited to three attempts; expired processing leases that exhaust this limit become terminal failures. Add explicit timeouts, atomic quotas, retry classification, dedicated dead-letter handling and token/cost budgets before production use.
- Research currently uses only workspace document retrieval, not cross-provider tool orchestration.
- Add workspace-specific budgets, permissioned tool registry, execution-cost tracking, approval gates and multi-agent delegation.
- Add migrations rather than relying on metadata table creation for production schema changes.
- Run backend integration tests with multiple workspaces and authenticated users before production deployment.

## Agent configuration and research results

Agents support editable names, instructions, and three output styles (detailed notes, concise, and report). Preferences are applied to grounded answer generation and cannot override the citation or source-trust policy. Deleting an agent also removes its history, and is blocked while research is queued or processing.

A completed worker execution is not equivalent to a verified answer. Citation-validation failures now mark runs failed; the UI exposes the evidence and a retry path. Numbered citations link to retrieved passages, but this does **not** establish claim-level factual entailment.

Agent retrieval supports selected indexed workspace documents and explicitly enabled read-only connected sources. Per-agent model settings, persistent memory, and workflow orchestration are not implemented. Agent instructions are presentation/task preferences, not arbitrary executable tools.

## Agent source tools and claim assessment

Agent configuration now persists selected indexed-document IDs, Gmail enablement, and a list of connected provider names. The editor lists only workspace-accessible connections and ready documents. Worker research reuses Atlas's read-only connected evidence collector, per-provider permissions, and post-search access revalidation. Agent runs are restricted to eight evidence passages across at most three planned queries; selected document IDs are validated against the workspace. An empty document selection means all indexed workspace documents when documents are enabled.

Each generated answer stores a bounded per-claim evidence assessment. Cited sentences are screened for lexical alignment, and, when an AI provider is configured, a separate entailment assessment labels claims supported, contradicted, or insufficient. This is **automated evidence assessment, not proof or independent fact checking**. The UI displays each claim and its cited source IDs, and does not equate a valid citation with a verified fact. Without an AI provider or if assessment fails, the system reports lexical candidates and uncertainty rather than fabricating verification.

## Agent Library and chat mentions

The Agents tab is now a searchable configuration library, not a separate chat runner. Each card displays its source scope and a generated mention handle (for example `@research-analyst`). Use the existing Atlas Chat composer to type `@`, choose a configured agent, and ask a question. Only one agent is invoked per message; regular unmentioned questions continue through the default research flow.

Agent mentions start a background run using the agent's configured read-only sources and instructions. The requesting user's conversation persists both the question and the resulting cited answer, with agent name and run ID attribution. The answer is rendered by the native Atlas evidence component. The worker must be running for agent mentions to complete. Existing per-agent run APIs remain available for debugging and historical traces.

Current limitations: handles are derived from display names and should be kept unique within a workspace; an agent rename changes its handle. Long-running requests are polled in the active browser tab. Browser-level integration testing of the new interaction is still required.
