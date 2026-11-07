# Security and production-readiness checklist

Atlas handles uploaded files, workspace content, provider credentials, and generated
answers. Existing controls reduce risk but do not constitute a security certification
or production approval.

## Implemented controls (verify against the deployed commit)

- Workspace and organisation role checks are enforced server-side on scoped routes.
- Source grants constrain use of private connected credentials; provider permissions
  remain an additional boundary.
- Connected-source credentials and OAuth refresh tokens are encrypted at rest using
  the configured Fernet key. The key must be stable, backed up, and kept outside Git.
- OAuth uses random state, hashed state storage, expiry, single-use consumption, and
  PKCE. Redirects require HTTPS outside localhost/127.0.0.1.
- Outbound page fetching validates public addresses, rejects mixed/private DNS
  answers, pins the connection to the validated address, disables proxy inheritance,
  and does not follow redirects.
- Connector errors avoid returning raw provider response bodies or credentials.
- Browser responses set frame, content-type, referrer, and permissions headers.
- Security-history events exclude credentials, prompts, and source excerpts.

These are implementation observations, not evidence that the deployed environment
has matching configuration or that every threat has been independently assessed.

## Required before production exposure

- [ ] Deploy only behind HTTPS; set secure, HttpOnly, appropriately SameSite session
      cookies and verify proxy TLS termination and trusted-host behavior.
- [ ] Establish secrets management and rotation for session signing, Fernet encryption,
      AI, OAuth, database, and provider credentials. Test restore from encrypted
      backups; document key-loss recovery.
- [ ] Use least-privilege provider scopes and verify Google/Microsoft app consent,
      redirect URIs, tenant policy, refresh-token behavior, revocation, and reconnect
      flows using dedicated test tenants.
- [ ] Perform end-to-end OAuth tests against real provider test applications in
      staging. Mocked HTTP tests are not provider verification.
- [ ] Restrict database/network access, require managed database TLS, configure
      backups and restore drills, and review migration rollback procedures.
- [ ] Add rate limits and abuse controls for authentication, uploads, web fetching,
      chat, and provider API calls; set request/body/concurrency quotas.
- [ ] Review upload type detection, malware scanning, archive/decompression limits,
      parser isolation, filesystem permissions, retention, and deletion behavior.
- [ ] Review SSRF protections under DNS rebinding, IPv4/IPv6 edge cases, redirects,
      proxy settings, and egress firewall rules.
- [ ] Configure structured redacted logs, alerting, audit retention, incident
      response, and secret-leak detection. Verify no tokens or source content enter
      logs, traces, analytics, or error-reporting services.
- [ ] Run dependency, container, and secret scans; pin and update dependencies;
      generate an SBOM and define vulnerability response SLAs.
- [ ] Run an independent threat model and penetration test covering tenant isolation,
      authorization races, OAuth CSRF, XSS, CSRF, SSRF, file parsing, and data export.
- [ ] Define privacy notices, retention/deletion, user export, and provider
      disconnect/revocation procedures.
- [ ] Validate horizontal scaling, worker isolation, migrations, resource exhaustion,
      and disaster recovery under production-like load.

## OAuth and deployment verification record

Automated tests can validate local control flow and mocked provider responses. They
cannot verify real Google/Microsoft consent configuration, tenant policies, redirect
registration, production TLS/proxy behavior, secret provisioning, or deployed
database/network policy. Record the staging environment, provider test tenant, exact
commit, test date, observed results, and reviewer before marking these items complete.

## Retrieval and answer-quality release gate

A synthetic offline retrieval fixture is useful for regressions, but is not a
production benchmark. Before launch, evaluate a consented/de-identified and
human-reviewed dataset with difficult multi-source questions, hard negatives,
connector-specific slices, and held-out examples. Measure retrieval recall/precision,
MRR/nDCG, citation correctness, answer faithfulness, and abstention behavior. Every
claim still needs evidence review: lexical overlap and polarity/number checks do not
prove semantic entailment.

## Reporting vulnerabilities

Do not publish secrets, personal data, or exploit details in public issues. Contact
the repository maintainers privately with a concise report and reproducible impact.
