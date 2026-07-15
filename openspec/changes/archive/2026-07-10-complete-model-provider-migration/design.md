## Context

`modelProvider` already selects `local` or `remote`, and `createInferenceClient()` honors that selection for chat and Responses requests. Product extraction instead constructs a local client directly from `inferenceRuntime`, so remote providers cannot run product sync and business code knows about local profiles and `mmproj`.

The existing `OpenAICompatibleClient` already implements chat, Responses, health, and multimodal requests. No new provider framework is needed.

## Goals / Non-Goals

**Goals:**

- Make the selected Model Provider the only route to all model operations.
- Expose multimodal requests on the same internal client contract used by business features.
- Keep selected-provider capability checks and local runtime lifecycle inside provider creation.
- Preserve the no-silent-fallback rule between local and remote providers.
- Surface actionable product-sync failures.

**Non-Goals:**

- Add a third provider kind or vendor SDK.
- Change PDD product APIs or knowledge schemas.
- Fall back from local to remote, or remote to local, without operator selection.
- Redesign the model settings UI.

## Decisions

### 1. Extend the existing internal client contract

The main-process model client contract gains `chatMultimodal`. The existing `OpenAICompatibleClient` satisfies it, so business code can request multimodal work without knowing which provider was selected.

Alternative: introduce provider classes and a registry. Rejected because there are only two configured paths and the existing factory already owns selection.

### 2. Keep local runtime readiness in the provider factory

When the selected provider is local, provider creation validates the requested capability and starts the managed runtime when necessary. When it is remote, provider creation validates the configured endpoint and returns the remote client. Product sync never reads local runtime fields.

### 3. Require the selected provider, never cross-provider fallback

A local provider without declared vision support fails with a local capability message. A remote provider uses its configured multimodal endpoint and reports that endpoint's error. The application never sends product data to another provider implicitly.

### 4. Preserve source data and show the real failure

Product sync continues to record retryable failures and draft source records according to the existing knowledge lifecycle. The renderer displays the sanitized first failure instead of a generic message.

## Risks / Trade-offs

- [Risk] A remote endpoint may accept chat but reject image inputs. → Report the selected provider's actual sanitized error and keep the sync failed; do not fall back.
- [Risk] Starting a local runtime for every client request can duplicate lifecycle work. → Reuse the existing runtime manager and health probe.
- [Risk] Provider migration could change reply behavior. → Keep the existing chat/Responses construction unchanged and add focused routing tests.

## Migration Plan

1. Extend the shared main-process client shape with multimodal support and capability-aware provider creation.
2. Route product extraction through the selected provider.
3. Remove product-sync imports and checks for local profiles/runtime.
4. Surface the real product-sync error and run local/remote routing tests, full tests, build, and packaged smoke.

Rollback: restore the prior product extractor while leaving provider settings unchanged. No persisted data migration is required.

## Open Questions

None.
