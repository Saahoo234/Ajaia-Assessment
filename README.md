# CollabDocs — AI-Native Full Stack Developer Assessment

A deliberately scoped, Google Docs-inspired document editor with rich text, upload/import, account switching, sharing permissions, and durable PostgreSQL persistence.

## Live deployment

**URL:** [REPLACE_WITH_RENDER_URL]

### Demo accounts

Use the **Acting as** selector in the lower-left sidebar (no credentials necessary):

| User | Role |
| --- | --- |
| Alice Johnson | Seeded account / document owner |
| Bob Smith | Seeded account / share recipient |
| Charlie Lee | Seeded account / access-denied test |

1. As Alice, click **New document**; type formatted content, then return to dashboard.
2. Reopen it to verify persistence.
3. Click **Share** and choose Bob.
4. Switch to Bob; the document should appear under **Shared with me** and be editable.
5. Switch to Charlie; the document must not appear in his dashboard. Requesting its API URL as Charlie returns 404.
6. As Alice, revoke Bob's access from the Share menu; Bob no longer sees it on refresh.

## Features

- Create, rename, delete, save, and reopen documents
- Bold, italic, underline, H1/H2, bulleted and numbered lists, undo/redo
- Autosave after 650 ms idle; save-on-navigation/switch
- Import `.txt` or `.md` file, **500 KB maximum**, into an editable document
- Seeded demo users and owner-controlled sharing / revocation
- Clearly separated **My documents** / **Shared with me** sections
- API-level access checks and server-side HTML sanitization
- PostgreSQL tables created automatically on startup

## Tech stack

React 18, Vite, Tiptap, Express, `pg`, PostgreSQL hosted on Neon, Render for combined backend/frontend deployment. Node.js 20+.

## Local development

1. Create a free PostgreSQL database (e.g. Neon). Copy its connection string.
2. `cp .env.example .env` (on Windows PowerShell: `Copy-Item .env.example .env`)
3. Set `DATABASE_URL` to your PostgreSQL connection string. **Do not commit `.env`.**
4. `npm install`
5. `npm run dev`
6. Open `http://localhost:5173`. API is served by Express at `http://localhost:3001` and proxied by Vite.
7. Run `npm test` for automated tests.

## Production build and deployment (Render)

1. Push this folder to a GitHub repo (exclude `.env`).
2. Create a Neon free-tier PostgreSQL database; copy the connection string.
3. On Render, select **New > Blueprint** (reads `render.yaml`) or create a Node Web Service.
4. Configure **Build command** `npm install && npm run build` and **Start command** `npm start`.
5. Set environment variable `DATABASE_URL` to the Neon connection string, with SSL enabled as supplied by Neon. Ensure `NODE_ENV=production`.
6. Deploy, then open `https://YOUR-SERVICE.onrender.com` and verify `/api/health` returns `{ "ok": true }`.
7. Replace `REPLACE_WITH_RENDER_URL` in README and SUBMISSION with the real URL.

**Cost:** Neon and Render may offer free-tier plans subject to their current usage policies. Check plan selection before creating services. Free Render services may cold-start after inactivity.

## Running as a single production server locally

`npm run build && npm start` then visit `http://localhost:3001`.

## Limitations / product decisions

- **Demo identity switcher instead of real authentication.** This intentionally demonstrates access control behavior but is NOT secure authentication: headers are user-controlled. Never use for sensitive data or production customers.
- **Shared users can edit; owners alone can share, revoke, delete.** Clear, minimal permission semantics.
- **Not real-time co-editing.** Concurrent edits to the same document are last-write-wins; use sequential user testing.
- **No version history, comments, DOCX/PDF import, offline mode, or attachments.** These were cut to prioritize a complete core flow.
- **Large content cap 500 KB.** Suitable for this demonstration, not large documents.
- **HTML formatting stored in Postgres after server-side sanitization.** Rich content persists without editor JSON schema migrations.

## Automated tests

`npm test` verifies shared/owner/unrelated-user access-policy logic, rich-text sanitization, and title/user validation. Also manually verify API-level ownership checks in the walkthrough. Automated tests do not replace end-to-end browser tests.

## Next 2–4 hours

Add real authentication and database-backed sessions, permission roles, optimistic-concurrency version checks, document-level integration tests, and richer import/export.
