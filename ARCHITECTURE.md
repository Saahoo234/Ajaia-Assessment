# Architecture and Prioritization

## System

Browser (React + Tiptap) -> `/api/*` (Express) -> PostgreSQL (Neon). In production Express serves the built Vite frontend as well as API routes. A single Render web service reduces deployment friction.

## Data model

- `users(id, name, email)`: three seeded demo identities
- `documents(id, owner_id, title, content, created_at, updated_at)`: content is sanitized HTML
- `document_shares(document_id, user_id, created_at)`: unique (document, recipient) pair

## Access rules

Every document GET/PATCH checks ownership or a sharing grant at the SQL layer. Sharing/revocation/deletion require ownership. Unauthorized lookup uses 404 to avoid exposing document existence. All user input is validated, and incoming rich HTML is sanitized before persistence. The demo header `x-demo-user` is not real authentication; it is a clearly labeled assessment-only simulation.

## Prioritization

1. **End-to-end vertical slice:** create -> edit -> autosave -> reopen.
2. **Meaningful collaboration without distributed-systems complexity:** owner/sharee permissions, switch user, shared dashboard.
3. **Real file handling:** `.txt` and `.md` imports; small enough to implement and test reliably.
4. **Deployment and reliability:** single service, hosted persistent SQL database, explicit errors, health endpoint, automated tests.

## Deliberate tradeoffs

- Tiptap instead of `contenteditable` from scratch: accessible editing behavior with proven formatting commands.
- Sanitized HTML instead of complex collaborative document CRDT: keeps content formatting, simpler persistence.
- PostgreSQL rather than local SQLite for deployment: durable data across cold starts/restarts.
- Seeded accounts rather than OAuth: makes sharing easy to demonstrate; not suitable for real customers.
- Last-write-wins saves: simpler MVP, but concurrent modifications can overwrite each other.

## Future work

Actual authentication, granular view/edit permissions, optimistic locking, version history, reliable offline saves, and real-time collaborative editing with Yjs + WebSockets.
