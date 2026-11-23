# CollabDocs — Submission Manifest

## Included

- `client/src/` — React / Tiptap frontend and styling
- `server/` — Express REST API, PostgreSQL persistence and input sanitization
- `tests/security.test.js` — automated access-policy, validation, sanitization tests
- `README.md` — feature descriptions, demo users, local setup and deployment
- `ARCHITECTURE.md` — design, scope, tradeoffs, next steps
- `AI_WORKFLOW.md` — AI use and verification notes (complete truthful placeholders)
- `render.yaml` — Render deployment configuration
- `.env.example` — required environment configuration
- `walkthrough-video-url.txt` — public walkthrough URL (to be filled)

## Links

- **Live app:** [REPLACE_WITH_LIVE_URL]
- **Source code:** [REPLACE_WITH_GITHUB_URL]
- **Walkthrough video:** [REPLACE_WITH_VIDEO_URL]
- **Google Drive submission folder:** [REPLACE_WITH_FOLDER_URL]

## Reviewer flow

Open live app. Select Alice, create a document, type and format content, navigate home and reopen. Share with Bob, switch to Bob, find in Shared with me, edit, and reopen. Switch to Charlie to verify the document is inaccessible. Import a .txt or .md document as a final flow.

## Working / incomplete

Working: [Verify in deployed environment before declaring].
Incomplete: Concurrent real-time editing, OAuth authentication, comments, DOCX import, version history. Add any real gaps discovered in testing.
Next 2–4 hours: Real login, optimistic edit-versioning, and end-to-end access tests.
