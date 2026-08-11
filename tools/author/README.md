# ChazzasBlog Authoring Tool

**This is a local development tool only.** It is not part of the deployed
site, is never invoked by the GitHub Actions build/deploy pipeline, and is
never copied into `dist/`. It has no authentication and writes directly to
files on your disk, so it must **never** be exposed to a network or the
internet:

- The server binds only to `127.0.0.1` (loopback), never `0.0.0.0`.
- Do not put it behind a reverse proxy, port-forward it, run it on a shared
  machine, or deploy it anywhere.
- It is meant to be run on your own laptop while you write a post, then shut
  down.

## Running it

From the repo root:

```
node tools/author/server.js
```

or:

```
cd tools/author
npm install
npm start
```

Either way it installs its own dependencies (this folder has its own
`package.json`, separate from the repo root) and starts listening on
`http://127.0.0.1:3001`. On startup it prints a loud banner confirming it is
local-only and shows the address it's listening on - double check that
address says `127.0.0.1`, not `0.0.0.0` or anything else, before you trust it.

Open `http://127.0.0.1:3001/` in a browser to use the form.

### Windows: launch by double-clicking

There's a Desktop shortcut ("Chazza's Blog - New Article", with its own
amber icon) that boots the whole thing with one click: it silently starts
the server and opens the tool in a chromeless app window (no tabs/address
bar) rather than a normal browser tab. If Node.js can't be found, you'll get
a clear popup instead of nothing happening.

Two files make this work, in this folder:

- `launch-silent.vbs` - what the Desktop shortcut actually points to. Checks
  Node.js is available (showing a popup if not), then runs the `.bat` below
  with no visible window at all.
- `Launch Author Tool.bat` - starts the server (in its own minimized console
  window, so you can still peek at logs or close it) and opens
  `http://127.0.0.1:3001` in an app-mode Edge/Chrome window, falling back to
  a normal browser tab if neither is installed. Useful to run directly
  (double-click it, or `node server.js` from a terminal) if you want to see
  server output while debugging.

Either way, close the server's console window when you're done for the day.

You can also **install** the tool as a proper Windows app instead of (or as
well as) using the Desktop shortcut: with it open in Edge/Chrome, click the
install icon (⊕) in the address bar. That adds its own Start Menu entry and
taskbar icon, independent of the shortcut/server process.

## Two views

- **New Article** (`/` or `/index.html`) - the create form.
- **Manage Articles** (`/manage.html`) - lists every article in
  `content/articles/`, with **Edit** (opens the same form pre-filled,
  `/index.html?edit=<filename>`) and **Delete** (asks for confirmation
  first) per article.

The stable identifier for edit/delete is always the article's **JSON
filename** (e.g. `2026-08-11-hello-world.json`), never the slug alone -
slugs aren't guaranteed unique across different dates.

## What the form does

Fill in:

- **Title** (required)
- **Slug** - auto-suggested live from the title as you type, but editable.
  The server always re-derives/re-validates the final slug itself; it never
  trusts what the browser sends.
- **Published** - defaults to "now" (local time) on page load, editable.
- **Summary** (required, max 300 characters, with a live counter)
- **Body** - Markdown source, plain textarea (no WYSIWYG editor).
- **Cover Image** (optional) - `.jpg`, `.jpeg`, `.png`, `.webp`, or `.gif`,
  max 5MB.
- **Alt text** - required if a cover image is chosen.
- **Tags** - comma-separated.
- **Draft** - checkbox; draft articles are excluded from the production
  build unless `INCLUDE_DRAFTS=1` is set when running `npm run build`.

On submit (create, via `POST /api/articles`, or edit, via
`PUT /api/articles/<filename>`), the server:

1. Re-slugifies the title/slug server-side (never trusts the client value
   raw).
2. **Create:** picks the target file `content/articles/<YYYY-MM-DD>-<slug>.json`,
   based on the date portion of "Published". If that file already exists it
   auto-suffixes the slug (`-2`, `-3`, ...) instead of overwriting anything.
   **Edit:** if the (re-slugified) title/slug is unchanged from the
   article's current slug, the existing file is overwritten in place. If
   the slug changed, the file (and its
   `content/images/articles/<old-slug>/` folder, if any) is renamed to the
   new slug using that same collision-avoidance suffixing. `updatedAt` is
   always set to the current date/time automatically on every edit - you
   never need to set it by hand.
3. If an image was uploaded, validates its extension/MIME type against an
   allowlist and its size against a 5MB cap, sanitizes the filename, and
   writes it to `content/images/articles/<slug>/<safe-filename>`. On edit,
   a newly-uploaded image replaces the old one; if no new image is
   uploaded, the existing `coverImage` is kept as-is.
4. Runs the Markdown body through the **exact same** shared
   `build/lib/markdown.js` module the production build uses (via a relative
   `require`), so the sanitization applied is byte-identical to what will
   happen at build time. If anything looks like it will be stripped (e.g. a
   `<script>` tag pasted into the body), the response includes a warning so
   you notice before publishing.
5. Validates the assembled article object against
   `schema/article.schema.json` with AJV.
6. Writes the article JSON (and image, if any) to disk and stops. **It does
   not touch git in any way** - no `git add`, no commit, nothing.

`DELETE /api/articles/<filename>` removes the JSON file and its
`content/images/articles/<slug>/` folder (if any) immediately from disk -
also without touching git.

## Publishing what you wrote

**Saving, editing, and deleting articles in this tool never touches git.**
That is a completely separate, explicit step you trigger yourself:

1. After any successful save, edit, or delete, the page shows a
   "Ready to publish?" panel.
2. That panel calls `GET /api/git/status` and shows you, in plain text,
   exactly which files under `content/` git considers changed - this is
   your chance to actually look before anything is committed.
3. It pre-fills an **editable** commit message textarea with a sensible
   default (e.g. `Publish article: "<title>"`).
4. Nothing is committed or pushed until you click **"Push to GitHub"**.
   Only then does the server run, in order, over exactly the paths this
   operation touched (never a blanket `git add -A`):
   - `git add -- <paths>`
   - `git commit -m "<your message>"`
   - `git push`

   If any step fails - e.g. `git commit` because there was nothing to
   commit, or `git push` because the remote has newer commits - it stops
   immediately and shows you the exact error. **It will never `git push
   --force`**; if push fails because of upstream changes, resolve it
   yourself from a terminal (`git pull`, resolve, `git push`) and then
   continue.

### One-time prerequisite

The publish button only works once this folder is an actual git repository
with a configured remote and working push credentials. If it isn't yet,
`GET /api/git/status` returns a clear message instead of a publish button,
and you'll need to do this yourself from a terminal **once**, e.g.:

```
git init
git remote add origin <your GitHub repo URL>
git add .
git commit -m "Initial commit"
git push -u origin main
```

This tool deliberately never runs `git init`, adds a remote, or does that
first push for you - that's a one-time decision Charlie makes, not
something automated.

If you'd rather publish by hand instead of using the button, that still
works exactly as before:

```
git diff
git add content/articles/<the-file>.json content/images/articles/<slug>/  # if an image changed
git commit -m "Add article: <title>"
git push
```
