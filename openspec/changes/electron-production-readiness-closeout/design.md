## Context

The Electron app has implemented the main merchant assistant path: SQLite-backed state, encrypted account sessions, LanceDB knowledge indexing, LangChain reply generation, OpenAI-compatible inference, Playwright-assisted Pinduoduo login, PDD WebSocket start/stop, and text-send support. A real PDD merchant acceptance pass on 2026-06-03 validated login, session extraction, account start, and account stop, while buyer-message receive and real reply send remain pending external test-message coordination.

The remaining work is cross-cutting readiness rather than a new product feature. It spans IPC handlers, stored records, renderer status surfaces, release scripts, and operational logs.

## Goals / Non-Goals

**Goals:**

- Persist human-review draft ignore and escalate decisions with source message state updates.
- Record repeatable merchant acceptance evidence without storing credentials, plaintext cookies, or private buyer data.
- Add preflight checks that prevent production release artifacts from being published with placeholder update configuration or missing release environment.
- Validate that packaged apps can find bundled Playwright browsers and can open the PDD login runtime.
- Surface diagnostics for account session expiry, token retrieval failure, WebSocket disconnects, send failures, inference configuration, and knowledge readiness.
- Classify readiness as demo-ready, acceptance-ready, or release-ready using concrete checks.

**Non-Goals:**

- Bypassing PDD captcha, QR, or risk-control challenges.
- Adding cloud sync, SaaS backend, or multi-operator server state.
- Completing Apple developer credential provisioning or update hosting inside source control.
- Guaranteeing buyer-message validation without access to a separate buyer/test-message path.
- Replacing the existing SQLite/sql.js store or changing the PDD endpoint strategy.

## Decisions

- **Store acceptance runs as local evidence records.** Acceptance records will live in the local app state or as local OpenSpec/manual acceptance artifacts with account aliases, shop ids, timestamps, app version, platform, pass/fail outcomes, and blockers. Alternative considered: relying on logs only; rejected because logs are too noisy and do not classify required acceptance steps.
- **Keep secrets out of evidence.** Acceptance output MUST redact passwords, cookies, tokens, precise buyer identifiers when not needed, and raw payloads that contain private customer data. Alternative considered: attaching full logs; rejected because it risks leaking session material and buyer data.
- **Use existing IPC and store boundaries.** Review lifecycle and diagnostics will extend current account/message/draft/log flows instead of introducing a new backend process. Alternative considered: a separate diagnostics service; rejected because readiness checks are local-first and can be composed from existing service health.
- **Make release preflight fail fast.** Production packaging should fail before artifact publishing when update feed values remain placeholders or signing/notarization requirements are missing. Alternative considered: documenting manual checks only; rejected because placeholder release artifacts are easy to ship by mistake.
- **Treat packaged Playwright as a release requirement.** The packaged app must resolve its bundled browser path and open the PDD login browser in a packaged runtime. Alternative considered: requiring developers to install Playwright browsers separately; rejected because merchant users cannot be expected to run developer setup.
- **Classify readiness from checks, not subjective labels.** Demo-ready, acceptance-ready, and release-ready states will be computed from acceptance records, diagnostics, and release preflight results. Alternative considered: a single boolean ready flag; rejected because current blockers have different owners and risk levels.

## Risks / Trade-offs

- **Real PDD validation depends on external account and buyer-message access** -> Keep acceptance records capable of marking receive/send reply as blocked with a concrete reason, while allowing login/start/stop evidence to pass independently.
- **PDD pages and endpoint shapes can change** -> Keep diagnostics close to PDD adapter boundaries and record URL/status/error summaries without storing sensitive payloads.
- **Release credentials are environment-specific** -> Validate presence and placeholder avoidance without requiring credentials in source control.
- **Diagnostics can leak sensitive data if raw errors are copied directly** -> Sanitize diagnostic records and logs before showing or storing acceptance evidence.
- **Readiness classification can become stale** -> Include timestamps and app version/build context in acceptance and preflight records.

## Migration Plan

1. Add review lifecycle state persistence and tests for send, ignore, and escalate paths.
2. Add acceptance evidence templates/records and update the manual PDD acceptance flow with the 2026-06-03 partial pass.
3. Add release preflight checks for update URL, signing/notarization environment, and packaged Playwright browser availability.
4. Add runtime diagnostics and renderer surfaces for PDD, inference, knowledge, and release readiness.
5. Run typecheck, package tests, renderer tests, build, runtime smoke, packaged runtime smoke, and real PDD acceptance steps where external accounts are available.

## Open Questions

- What update feed URL should replace the current placeholder for production builds?
- Which macOS signing/notarization environment is the first supported release target?
- Which buyer/test account or test-message method will be used to complete receive/send reply acceptance?
