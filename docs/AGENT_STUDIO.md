# Atlas Agent Studio — initial milestone

Agent Studio provides workspace-scoped saved research agent configurations, bounded read-only research execution, and persistent run traces.

## API

- GET /api/workspaces/{workspaceId}/agents — list saved agents (viewer)
- POST /api/workspaces/{workspaceId}/agents — create agent (editor)
- GET /api/workspaces/{workspaceId}/agents/{agentId}/runs — inspect recent runs (viewer)
- POST /api/workspaces/{workspaceId}/agents/{agentId}/runs — execute research (editor)

Requests use existing session authentication and workspace RBAC. Runs plan up to three bounded retrieval queries, retrieve only ready documents from the requested workspace, deduplicate at most eight evidence passages, and generate grounded answers through Atlas's existing RAG engine. Each run also includes a document-to-passage provenance graph, visible in Agent Studio. Graph edges indicate containment, not semantic entailment. Source text is untrusted. Agent instructions are stored but **not used as privileged prompts**.

## Limitations and next steps

- Runs execute synchronously; add durable background dispatch, cancellation, timeouts and concurrency limits.
- Research currently uses only workspace document retrieval, not cross-provider tool orchestration.
- Add workspace-specific budgets, permissioned tool registry, execution-cost tracking, approval gates and multi-agent delegation.
- Add migrations rather than relying on metadata table creation for production schema changes.
- Run backend integration tests with multiple workspaces and authenticated users before production deployment.
