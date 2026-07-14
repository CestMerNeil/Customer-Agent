## 1. Agentic RAG orchestration

- [x] 1.1 Prefetch the existing current-shop customer-service catalog before the first model request and append its compact result to the initial Agent input
- [x] 1.2 Keep exact detail retrieval model-directed and add focused tests for catalog exposure, relevant detail selection, and no-knowledge turns

## 2. Grounding evidence

- [x] 2.1 Attach deduplicated gathered citations to normal and loop-limit final workflow events
- [x] 2.2 Verify desktop Agent audit persistence records final citation presence and absence accurately

## 3. Knowledge-aware routing

- [x] 3.1 Treat a persisted empty handoff keyword list as disabling keyword interception
- [x] 3.2 Add a deterministic handler-chain test proving an eligible policy question reaches the Agent when keywords are explicitly empty

## 4. Verification

- [x] 4.1 Run focused tests, package and desktop typechecks, production build, and strict OpenSpec validation
- [x] 4.2 Restart the desktop app with the rebuilt Agent package

## 5. Real acceptance

- [ ] 5.1 Record sanitized real catalog → detail → final citation → PDD delivery evidence plus a legitimate no-knowledge path
