# AI-Native Workflow Note

**Tools used:** ChatGPT for requirements decomposition, initial scaffolding, API implementation, UI scaffolding, tests, documentation, and deployment checklist. Cursor Grok for a follow-up review of the existing app: compile and runtime checks, access-control tests, and the fixes listed below.

**Where AI saved time:** Drafted the MVP scope from an ambiguous specification; generated a cohesive initial React/Express/Tiptap/Postgres implementation and starter tests; produced deployment and reviewer documentation to reduce missed deliverables. The follow-up pass used the assistant to trace the Express routes, Tiptap toolbar behavior, and Postgres access queries, then add route tests instead of re-reading every request by hand.

**Human judgment and changes:** The original feature set was kept: Alice, Bob, and Charlie; document CRUD; Tiptap formatting; `.txt`/`.md` import; autosave; and PostgreSQL through `pg` on startup. Corrections after review:

- Database setup no longer connects while the module is imported. `npm start` still requires `DATABASE_URL`, and that failure is now caught and printed as `Startup failed`.
- Local `localhost` and `127.0.0.1` connection strings disable SSL. Hosted connection strings, including Neon, still use SSL with `rejectUnauthorized: false`.
- A title-only save no longer writes the document body back, so an autosave cannot restore a stale body over a renamed title.
- The share menu now submits a user who is actually in the dropdown. Bob and Charlie previously kept the default recipient `bob`, so sharing their own document was rejected.
- Toolbar buttons prevent the mouse press from blurring the editor, so bold and the other formatting commands keep the caret.
- Switching the demo user clears the document list immediately, so the previous person's titles are not shown while the next list loads.
- `react`, `react-dom`, `vite`, and `@vitejs/plugin-react` are dependencies so `npm install` still builds when `NODE_ENV=production`, which `render.yaml` sets.
- Route tests use PGlite only in development. The running server still uses `pg`.

**Verification performed:**

- `npm install` completed (303 packages, then PGlite added).
- Before these fixes, `npm test` passed 3 of 3 and `npm run build` succeeded with Vite 6.4.6.
- Final `npm test` (`node --test tests/*.test.js`), exit code 0: 7 passed, 0 failed, duration 9974.3016 ms. Coverage includes owner-only share/revoke/delete, Charlie receiving 404 on read and edit, Bob editing a shared document, import sanitization, and the missing-`DATABASE_URL` startup failure.
- Final `npm run build`, exit code 0: Vite 6.4.6, 132 modules, built in 4.79s. Output: `dist/index.html` 0.37 kB, `dist/assets/index-BlQJX-nv.css` 9.51 kB, `dist/assets/index-CTNMrTi0.js` 465.58 kB.
- Headless Microsoft Edge, against the production bundle and the real Express routes on `127.0.0.1`: Alice created and formatted a document, autosave reported Saved, reopening kept the text, Alice shared with Bob, Charlie's dashboard stayed empty, Bob edited the shared document and did not see Share, Bob shared his own document with Alice, and Alice imported a markdown file. No page errors.
- Not done: no deployment, no live URL, and no connection to Neon. Docker Desktop was installed but its daemon was not running, so `node-pg` was not exercised against a TCP Postgres server. `npm start` without `DATABASE_URL` exits 1, which was tested.

**Important limitation:** Demo identity switching is a deliberate simulated-auth decision and is not secure for real customer documents.
