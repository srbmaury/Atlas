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

Agent retrieval remains restricted to indexed workspace documents. Connected Gmail/Drive tools, per-agent source selection, model settings, persistent memory, and workflow orchestration are not implemented; do not display these as enabled capabilities. Agent instructions are presentation/task preferences, not arbitrary executable tools.
