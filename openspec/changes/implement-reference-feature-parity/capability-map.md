# Capability Map

This map ties reference must capabilities to the Electron + TypeScript target
surface and acceptance evidence.

| Reference capability | Target package/service | IPC/UI surface | Acceptance evidence |
| --- | --- | --- | --- |
| PDD login/session/account lifecycle | `packages/pdd`, `packages/db`, `apps/desktop/src/main` | `account.*`, account workspace | Real login/start/stop record for two generated account aliases |
| PDD WebSocket receive | `packages/pdd`, queue service | conversation queue, connection health | Real buyer/test-message receive record |
| Text send | `packages/pdd` | review workspace, conversation actions | Real text send record |
| Image send where supported | `packages/pdd` | conversation actions | Reference-audit plus live calibration result |
| Goods-card send | `packages/pdd`, Agent tools | Agent audit, product recommendation UI | Real goods-card send record with real goods ID |
| Customer-service list and transfer | `packages/pdd`, handoff service | human handoff workspace | Real transfer record or blocked permission record |
| Product list/detail sync | `packages/pdd`, `packages/knowledge` | product sync workspace | Real product sync record with parsed field summary |
| Product knowledge extraction | `packages/knowledge`, `packages/inference` | extraction review UI | Local multimodal model acceptance record |
| Customer-service knowledge | `packages/knowledge` | knowledge governance UI | Import/edit/search acceptance with governed entries |
| Multi-turn Agent tools | `packages/agents`, `packages/pdd`, `packages/knowledge` | Agent audit UI | Real Agent run with tool path and citations |
| Queue and handler chain | queue service, `packages/db` | queue health UI | Real queued message processing record |
| Keyword/intent handoff | handoff service, Agent | handoff workspace | Keyword, intent, after-hours, transfer/resume records |
| Multi-account/shop isolation | all shop-scoped services | account/shop selector | Two-account isolation record |
| Local model provisioning | `packages/inference`, desktop runtime manager | model settings/provisioning UI | Local runtime/model health and manifest record |
| Release automation | GitHub Actions, release scripts | release status | GitHub Release dry run or release metadata |

## Default Acceptance Scopes

The implementation generates these low-sensitive aliases unless the operator
overrides them locally:

- `pdd-account-a` / `shop-a`
- `pdd-account-b` / `shop-b`

No real credential, buyer identifier, cookie, token, raw payload, or private
contact detail belongs in this map or in committed acceptance records.
