# Agent Studio

Agent Studio lets workspace members configure reusable, read-only research agents and invoke them from **Home** or **Chat** using an `@agent-handle`. An agent stores a name, task instructions, output style and source selection. Its background runs produce a cited answer, a bounded evidence assessment and a persistent execution trace.

## Create an agent

1. Open **Agents** and select **Create agent**.
2. Enter a descriptive name and task instructions.
3. Choose **Detailed notes**, **Concise**, or **Report** as the output style.
4. Select ready workspace documents (optionally specific document IDs), Gmail, and/or connected providers visible to you.
5. Save. The Agent Library shows a generated handle such as `@research-analyst` and the configured knowledge sources.

The library is for configuration and run history, not a separate chat runner. Edit or delete agents from their cards. Deletion is blocked while research is queued or processing. Agent handles are derived from display names: renaming changes the handle, so keep names distinct within a workspace.

## Invoke an agent in a conversation

In Home or Chat, type `@`, choose an agent from autocomplete and ask your question. Atlas creates a background run and displays the result in the originating conversation with agent attribution, citations and evidence details. Only one agent is invoked per message. Questions without an agent mention use the normal chat flow.

**Agent sources are independent of chat filters.** For example, an agent configured for GitHub and Drive may use those sources even if the chat's normal source filter is set to Documents. This does **not** grant new permissions: the invoking user must be authorized to use each source.

The background worker must be running to process research. The client polls for completion while the relevant conversation is active.

## Source permissions and isolation

- Workspace RBAC governs agent management and execution. Listing agents requires viewer access; creation, editing, deletion and starting runs require editor access.
- Connected-source access is evaluated for the **invoking user**, not inherited from the agent's owner. Unavailable providers are excluded from the run; if no usable source remains, research cannot proceed.
- The configured source list and sensitive instructions are restricted when a viewer lacks the relevant connected-source grants.
- Runs are associated with the invoking user; run-history access and cancellation enforce run ownership.
- Access is revalidated during research and before returning stored evidence. Saved agent answers can be redacted after connected-source or resource-level grants change. Do not interpret this as a substitute for comprehensive multi-user security testing.
- Documents and connected records are read-only. Connected providers are searched on demand rather than automatically copied into the document library.

The effective connected evidence scope is the intersection of the agent's configured sources, the invoking user's workspace/source permissions, and provider-side visibility. The source provider's own permission model still applies.

## Research execution and evidence

Research is queued in the database and claimed by the background worker with leases and generation checks. The planner produces up to three bounded retrieval queries. The evidence collector combines selected indexed workspace documents and permitted connected sources, deduplicating up to eight passages. An empty document-ID selection means all ready workspace documents when Documents is enabled.

Agent instructions guide task presentation and answer style; they are **not privileged executable prompts** and cannot override source-trust or citation rules. The generated answer includes source citations and a document/passage provenance graph. Graph edges show relationships such as containment, not proof of factual entailment.

Claim assessment uses lexical matching and, when an AI provider is configured, an additional automated entailment assessment. Labels such as supported, contradicted and insufficient are **heuristic evaluations, not independent fact checking**. Citation validation failure can mark a run failed; an apparently valid citation is not a guarantee that its associated claim is true.

Research runs retain status, question, trace steps and a result or error. Cancellation invalidates queued or processing work at checkpoints, but cannot forcibly interrupt an in-flight model request.

## API reference

The endpoints below are relative to `/api/workspaces/{workspaceId}/agents`.

| Method | Path | Purpose | Minimum workspace role |
| --- | --- | --- | --- |
| GET | `/` | List agents | Viewer |
| GET | `/sources` | List available source choices | Viewer |
| POST | `/` | Create agent | Editor |
| PATCH | `/{agentId}` | Update agent | Editor |
| DELETE | `/{agentId}` | Delete agent | Editor |
| GET | `/{agentId}/runs` | Inspect your run history | Viewer |
| POST | `/{agentId}/runs` | Queue a research question | Editor |
| POST | `/{agentId}/runs/{runId}/cancel` | Cancel an owned run | Editor |

All endpoints require the existing authenticated session and enforce server-side workspace authorization. The user-facing `@mention` flow calls these APIs.

## Current limits and operational considerations

- Runs admit at most five active jobs per workspace and two per user, but admission quotas are not fully atomic under concurrency.
- A research run has up to three attempts; expired leases that exhaust the limit become terminal failures. Production hardening should include dedicated dead-letter handling, timeout policies and cost/token budgets.
- No multi-agent delegation, per-agent model configuration, persistent agent memory or arbitrary write-capable tool execution is implemented.
- Long-running requests depend on polling in the active browser tab; this is not a push-notification system.
- Connector credentials and live provider permissions need separate integration testing; CI tests do not prove access to real third-party accounts.
- Review source access, output quality and auditability before relying on agents in high-stakes or externally shared workflows.

See the [README](../README.md), [source setup](SOURCE_SETUP.md) and [database design](DATABASE.md).
