# TabNest

A Toby-style tab manager for Chrome that replaces the new-tab page, with two extras:

1. **Offline sharing.** Export any space (or several) as a single `.html` file. Anyone can open it in a browser
   with **no extension installed**: browse, search, open links, copy links.
2. **Git sync per space.** Each space can sync to its own repo: your company **Forgejo** for work spaces,
   **GitHub** for personal ones. Each space has an update setting: **Auto-pull / Ask me / Ignore**.

## Install (developer mode)

```bash
cd C:UsersAvenousLeeDesktopProjectTabNest
npm install
npm run build
```

Then in Chrome open `chrome://extensions`, turn on **Developer mode**, click **Load unpacked**, and pick the
`TabNestdist` folder. Open a new tab and TabNest appears.

After changing code, run `npm run build` again and press the reload icon on the TabNest card in `chrome://extensions`.

| Command | What it does |
| --- | --- |
| `npm run dev` | Runs the UI as a normal web page at http://localhost:5173/newtab.html, using sample tabs and localStorage. |
| `npm run build` | Builds the extension into `dist/`. |
| `npm test` | Unit tests (sync decisions, share export/import). |
| `npm run icons` | Regenerates the PNG icons. |

## Using it

- **Spaces** (left) contain **collections**, which contain **cards** (saved links).
- Drag tabs from **Open Tabs** (right) into a collection. Drop on the dashed box to start a new collection.
  The 💾 button saves the whole window as a collection.
- Drag cards to reorder, move them between collections, or drop them on a space in the sidebar.
- Double-click a space or collection name to rename it. Press `/` to search every space.

## Sharing a space offline

**Share** (top right of a space) downloads `Space name.html`. Send it by email, Teams or a shared drive.

Each space's settings (⋯ → *Offline sharing*) decide how its shared file behaves:

- **Snapshot.** A frozen copy.
- **Check for updates.** When opened, the file fetches the latest version of the space and shows
  *"A newer version is available: Show update / Ignore"*. *Save updated file* re-downloads the HTML with the new data.
  The link it checks is the space's git file, or a link you type.

  The check works automatically when the reader can reach the link:
  - **GitHub:** the repo must be public.
  - **Forgejo:** works without login if the repo is readable without login. For **private** repos, readers can click
    **Sign in with a token** in the file and paste their own Forgejo token (Settings → Applications, read access).
    A shared file can't use the browser's normal Forgejo login, so a token is the only way it can sign in. This also needs the
    Forgejo admin to allow cross-site requests in `app.ini`:
    ```ini
    [cors]
    ENABLED = true
    ALLOW_DOMAIN = *
    HEADERS = Content-Type,User-Agent,Authorization
    ```
  - **If the check fails** (no access, offline, CORS not enabled), the file says so and offers:
    **Ask <your name> for the latest version** (a ready-made email, using the name and contact you enter in the Share dialog),
    **Open source** (the file's page on Forgejo/GitHub, for readers who can sign in there), **Sign in with a token**, and **Try again**.

People who **do** have TabNest can use **Import**. For a private Forgejo space they add a Git remote for that server with their own token, which is then used automatically. With *Follow for updates* ticked, the imported space
keeps checking the original and applies its update setting (Ask me by default). Their own edits stay on their device.

## Sharing a private space with colleagues (fork / follow)

Your company Forgejo (`git.sophicauto.net`) only answers signed-in users, and that includes its API. So:

- **Colleagues with TabNest** can follow your space live.
- **Colleagues without TabNest** get the .html file as a snapshot. If they need a newer copy, the file offers
  "Ask Avenous for the latest version".

Set it up once:

1. **You:** create a repo for the space (e.g. `TabNest_TestingPage1`). Tick *Initialize repository* (README) so it has a `main` branch.
2. **You:** in TabNest, open **Git repositories** → **Add remote** and paste the clone address (`git@git.sophicauto.net:Avenous/TabNest_TestingPage1.git` works).
   Add a token with *repository: Read and write*. Then open the space's ⋯ → **Git repository** → **My space**. Use `space.json` as the file,
   or any path.
3. **You:** in Forgejo, open the repo → Settings → Collaborators, and add colleagues with **Read** access.
4. **Colleague:** installs TabNest, then adds the same remote with *their own* token (Read is enough). Then either:
   - **imports your shared .html file** with *Follow for updates* ticked, and TabNest links it to the repo automatically, or
   - creates a space → ⋯ → **Git repository** → **Follow (pull only)** → the same file path.
5. Your changes now reach them according to their own setting (Auto-pull / Ask me / Ignore). Their edits stay on their device and never touch your repo.

## Syncing across your devices with git

1. Create a repo on GitHub, GitLab or Forgejo/Gitea (e.g. `tabnest-spaces`). Adding a README is safest, so it isn't empty.
2. In TabNest, open a space → **Not synced** (or ⋯) → **Git repository**, and **paste the repository address**.
   Any form works: `git@host:Owner/Repo.git`, `https://host/Owner/Repo`, or the page URL from your browser. Click **Connect**.
3. TabNest works out the server type and default branch. Chrome asks once for permission to reach that server.
   - Public repo: connects straight away (read-only until you add a token).
   - Private repo / sign-in required: TabNest asks for an **access token** and links to the page that creates one.
4. Choose **My space**, keep or change the file path (e.g. `space.json`), pick the update setting, then **Save**.
5. On your other computer, connect the same repository and use the **same file path**. It pulls the content.

You can connect several repositories (work + personal). They're listed under **Git repositories** in the sidebar, where you can reconnect them
(e.g. after a token expires) or remove them. Several spaces can share one repository as separate files.

### How updates are decided

TabNest remembers the last version both sides agreed on, then on each check:

| Your copy | Server copy | Result |
| --- | --- | --- |
| unchanged | unchanged | up to date |
| changed | unchanged | uploaded (automatically a few seconds after an edit, if *auto-upload* is on) |
| unchanged | changed | **Auto-pull**: applied · **Ask me**: banner with *Pull update / Ignore* · **Ignore**: nothing until you press *Sync now* |
| changed | changed | **Merge both** (recommended): additions and deletions from each side are kept, edits merge field by field; if both changed the same field, yours wins and a note says so. Also *Use theirs / Keep mine / Keep as 2 spaces*. With **Auto-pull**, clash-free merges happen automatically. |

Checks run when you open a new tab (at most every 2 minutes) and every 15 minutes in the background. The toolbar badge
shows how many spaces have an update waiting. Every upload is a normal git commit, so you can see the history or roll back in Forgejo/GitHub.

## Privacy and security

- Everything is stored in the browser's local extension storage. Nothing is sent anywhere except the git servers you configure.
- Tokens stay in this browser's local extension storage. They are never written to shared files or to the repo.
  Anyone with access to your Windows account and Chrome profile could read them, so use tokens scoped to the one repo.
- Shared HTML files contain only space names, collection names, links, titles and notes.
- Favicons come from Chrome's own cache. Shared files use the site's own favicon address, if one was saved.

## Code map

| Path | Purpose |
| --- | --- |
| `src/types.ts` | Data model: Space → Collection → Card, sync and share settings, file formats |
| `src/store/store.ts` | App state (zustand), editing actions, auto-upload, conflict handling |
| `src/sync/engine.ts` | Sync decisions (pure, tested) and merging results safely with edits made meanwhile |
| `src/sync/providers.ts` | GitHub / Forgejo file API (one implementation, both use the same "contents" API) |
| `src/share/share.ts` | Builds the shared HTML file and parses imports |
| `src/share/viewer.js` / `.css` | The stand-alone viewer embedded in every shared file (no dependencies) |
| `src/browser/tabs.ts` | All Chrome tab/permission calls. Port this one file to support Edge or Firefox |
| `src/storage/storage.ts` | chrome.storage (or localStorage in dev), one key per space |
| `src/background.ts` | Service worker: 15-minute update checks, toolbar badge |
| `src/ui/` | React UI |

## Ideas for later

- Toby import: the parser exists (`src/share/toby.ts`) but is hidden from the UI, because Toby currently has no export.
- Edge works today as-is (same Chromium APIs). Firefox needs a `browser_specific_settings` manifest entry and testing.
- Tags, notes view, starred spaces, "Next" reading list, tab-limit warnings.
- Encrypt tokens with a passphrase.
