# Atlas database design

Atlas uses SQLite for local development and PostgreSQL with pgvector for deployments. The diagrams cover the 17 application tables. **FK** identifies a database foreign key. **App link** identifies a stored reference resolved by Atlas. Mermaid solid and dotted lines denote identifying and non-identifying relationships, respectively.

[SQLAlchemy models](../backend/app/db.py) · [Alembic migrations](../backend/migrations/versions)

## Accounts and access

```mermaid
erDiagram
    USERS ||..o{ LOGINS : has
    USERS ||..o{ ORGANISATIONS : owns
    USERS ||..o{ WORKSPACES : owns
    USERS ||--o{ ORGANISATION_MEMBERS : joins
    ORGANISATIONS ||--o{ ORGANISATION_MEMBERS : has
    USERS ||--o{ WORKSPACE_MEMBERS : joins
    WORKSPACES ||--o{ WORKSPACE_MEMBERS : has
    ORGANISATIONS |o..o{ WORKSPACES : "groups via app link"

    USERS {
        string id PK
        string email UK
        string display_name
    }
    LOGINS {
        string token PK
        string user_id FK
        float expires
    }
    ORGANISATIONS {
        string id PK
        string owner_id FK
        string name
    }
    ORGANISATION_MEMBERS {
        string organisation_id PK,FK
        string user_id PK,FK
        string role
    }
    WORKSPACES {
        string id PK
        string owner_id FK
        string organisation_id "nullable app link"
        string name
    }
    WORKSPACE_MEMBERS {
        string workspace_id PK,FK
        string user_id PK,FK
        string role
    }
```

A workspace with no organisation ID is personal. Organisation membership roles are `admin` and `member`. Workspace membership roles are `manager`, `editor`, and `viewer`. Ownership is stored separately. Organisation membership alone grants no workspace content access.

## Research and conversations

```mermaid
erDiagram
    WORKSPACES ||..o{ DOCUMENTS : contains
    WORKSPACES ||..o{ CHUNKS : scopes
    DOCUMENTS ||..o{ CHUNKS : splits
    WORKSPACES ||..o{ CONVERSATIONS : contains
    USERS |o..o{ CONVERSATIONS : "authors via app link"

    DOCUMENTS {
        string id PK
        string workspace_id FK
        string digest
        string status
    }
    CHUNKS {
        string id PK
        string document_id FK
        string workspace_id FK
        int page
        int ordinal
        text text
        vector embedding
    }
    CONVERSATIONS {
        string id PK
        string workspace_id FK
        string author_id "app link"
        string title
        json messages "includes answers and citations"
    }
```

Documents are unique by `(workspace_id, digest)`. A chunk has separate foreign keys to its document and workspace. Atlas keeps those references consistent when indexing. Conversation history is private to its author. Messages and citations are stored in `conversations.messages`.

SQLite can also maintain `chunks_fts`, an FTS5 virtual table synchronized with `chunks` by triggers. Alembic tracks the migration revision in `alembic_version`.

## Connected sources

```mermaid
erDiagram
    WORKSPACES ||--o{ EXTERNAL_CONNECTIONS : "one per provider"
    WORKSPACES ||--o| GMAIL_CONNECTIONS : "one Gmail slot"
    WORKSPACES ||--o{ SOURCE_GRANTS : issues
    USERS ||--o{ SOURCE_GRANTS : receives
    WORKSPACES ||--o{ SOURCE_HEALTH_CHECKS : "one per provider"

    EXTERNAL_CONNECTIONS {
        string workspace_id PK,FK
        string provider PK
        string connected_by "app link to user"
        boolean shared
        json shared_resource_ids "Drive files or Slack channels"
    }
    GMAIL_CONNECTIONS {
        string workspace_id PK,FK
        string connected_by "app link to user"
        boolean shared
    }
    SOURCE_GRANTS {
        string workspace_id PK,FK
        string provider PK
        string user_id PK,FK
    }
    SOURCE_HEALTH_CHECKS {
        string workspace_id PK,FK
        string provider PK
        boolean healthy
        float checked_at
    }
```

Atlas resolves grants and health checks by `(workspace_id, provider)`. Gmail uses `gmail_connections` and other providers use `external_connections`. A connection can be private, shared with selected members through `source_grants`, or shared with the workspace through its `shared` flag. Shared Drive and Slack searches are additionally restricted by the connection's resource allowlist.

## OAuth state and audit history

```mermaid
erDiagram
    USERS ||..o{ CONNECTED_OAUTH_STATES : initiates
    WORKSPACES ||..o{ CONNECTED_OAUTH_STATES : targets
    USERS ||..o{ DRIVE_OAUTH_STATES : initiates
    WORKSPACES ||..o{ DRIVE_OAUTH_STATES : targets
    USERS ||..o{ GMAIL_OAUTH_STATES : initiates
    WORKSPACES ||..o{ GMAIL_OAUTH_STATES : targets

    CONNECTED_OAUTH_STATES {
        string value PK
        string provider
        string user_id FK
        string workspace_id FK
        float expires
    }
    DRIVE_OAUTH_STATES {
        string value PK
        string user_id FK
        string workspace_id FK
        float expires
    }
    GMAIL_OAUTH_STATES {
        string value PK
        string user_id FK
        string workspace_id FK
        float expires
    }
```

OAuth state rows bind pending authorization attempts to a user and workspace. The connected OAuth table also stores the provider and a PKCE verifier.

```mermaid
erDiagram
    USERS |o..o{ ACCESS_EVENTS : "actor app link"
    WORKSPACES |o..o{ ACCESS_EVENTS : "workspace scope app link"
    ORGANISATIONS |o..o{ ACCESS_EVENTS : "organisation app link"

    ACCESS_EVENTS {
        string id PK
        string scope_type
        string scope_id
        string organisation_id
        string actor_id
        string action
        string target_id
        json details
        float created
    }
```

The pair `(scope_type, scope_id)` identifies a workspace or organisation. The separate `organisation_id` supports organisation-wide audit queries for workspace events. Audit references use stored IDs so events can survive deletion of the records they describe.
