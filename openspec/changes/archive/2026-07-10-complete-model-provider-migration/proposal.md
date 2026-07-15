## Why

The application exposes a unified local/remote Model Provider setting, but product-knowledge extraction bypasses it and directly requires the local runtime and `mmproj`. This makes product sync fail for correctly configured remote providers and leaks provider-specific concerns into business code.

## What Changes

- Route chat, Responses, health checks, and multimodal product extraction through one selected Model Provider factory.
- Keep local runtime startup and local capability validation inside the local provider path.
- Use the configured OpenAI-compatible endpoint for remote multimodal extraction without silently falling back between providers.
- Remove direct `inferenceRuntime`, local profile, and `mmproj` checks from product-sync business code.
- Show the provider's real background failure in the product-sync UI and logs.
- Add focused local/remote routing tests plus full desktop build and packaged smoke verification.

## Capabilities

### New Capabilities

- `model-provider-routing`: Defines provider-independent routing for chat, Responses, health, and multimodal requests, with provider-specific runtime concerns isolated behind the selected provider.

### Modified Capabilities

None.

## Impact

- Affected desktop main process: provider/client creation, local runtime startup, product-knowledge extraction, diagnostics.
- Affected renderer: product-sync failure feedback.
- Affected tests: provider routing and product-sync UI behavior.
- No new dependency, model format, provider kind, or PDD endpoint is introduced.
