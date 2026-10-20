# TabNest: setup and test guide

## 1. Install in Chrome (2 minutes)

1. Get the build:
   - **From this project:** use the folder `release\TabNest-v0.1.0` (or `dist` if you rebuild with `npm run build`).
   - **Sent as a zip:** right-click `TabNest-v0.1.0.zip` → *Extract All…* to a folder you will keep (e.g. `Documents\TabNest`).
     Chrome loads the extension from that folder every time it starts, so don't delete or move it.
2. Open Chrome and go to `chrome://extensions`.
3. Turn on **Developer mode** (switch in the top-right corner).
4. Click **Load unpacked** and choose the folder that contains `manifest.json`.
5. TabNest appears in the list. Click the puzzle-piece icon in the toolbar → 📌 pin **TabNest** so its icon is always visible.
6. Open a **new tab** (Ctrl+T). Chrome may show *"Change back to Google?"* or *"This page was changed by an extension"*: click **Keep it**.

You should see TabNest with a **Personal** space and a "Getting started" collection.

## 2. Try the basics

- **Save tabs:** drag a tab from **Open Tabs** (right) into a collection, or click 💾 to save the whole window as a collection.
- **Organise:** **New Collection**; drag cards to reorder or into another collection; drop a card on a space in the sidebar to move it there.
- **Rename:** double-click a space or collection name.
- **Search:** press `/` and type. Search covers every space.
- **Pictures and descriptions:** click ✏️ on a card. Add a description (up to 500 characters; the card shows 3 lines, hover for the rest).
  Pictures are optional: tick **Add a picture** to show the picture options.
  Add a picture by **Upload image**, dropping a file, pasting a screenshot (Ctrl+V), pasting an image link, or **Use website preview**.
  Uploaded pictures are shrunk (about 480px wide) and travel with the space, so they sync and show in shared files offline.
  Tick *Automatically add website previews* to get pictures whenever you save tabs (Chrome asks once for access to all websites).
- **Spaces:** **+ Create Space** in the sidebar. ⋯ → Space settings to change its name and colour.

## 3. Sync a space with Git

1. Create a repository (GitHub, GitLab or your company Forgejo). Private is fine, and so is an empty one.
2. In TabNest open the space → click **Not synced** (next to Share) → **Git repository**.
3. Paste the repository address (any form, e.g. `git@git.sophicauto.net:Avenous/TabNest_TestingPage1.git`) → **Connect**.
4. Chrome asks to allow access to that server → **Allow**.
5. If it asks for a token, click **Create a token here**, then:
   - **GitHub:** Fine-grained token → *Only select repositories* → your repo → Repository permissions → **Contents: Read and write** → Generate.
   - **Forgejo:** Generate new token → **repository: Read and write**.
   - **GitLab:** Add new token → tick **api**.
   Copy the token, paste it into TabNest, then click **Connect**.
6. Choose **My space**. Keep the file name (or type `space.json`), choose an update setting (*Ask me* is a good start), then click **Save**.
7. The chip changes to **Synced just now**. In the repo you'll see a new file (a commit by TabNest).

**Test syncing:** make a second Chrome profile (profile icon → *Add*) or use another PC. Install TabNest there, connect the
**same** repository with the **same file path**, and edit on one side. Within a few minutes (or after clicking the chip), the other side
updates according to its setting: **Auto-pull** applies it, **Ask me** shows a banner, **Ignore** stays quiet.

**Token expired?** The space shows a red *Sync problem* banner → **Update token**.

**Changed on two devices at once?** The space shows *"This space changed here and somewhere else"* → click **Merge both**.
Everything added or removed on either side is kept/removed, and edits are combined. If both changed the same thing, this device's version
wins and a green note lists what was decided. (With **Auto-pull**, clash-free merges happen without asking.)

## 4. Share a space offline

1. Open the space → **Share** → pick **HTML file** or **PDF** → tick the spaces → fill in **Shared by** (your name + email) →
   **Download HTML file** / **Save as PDF…** (for PDF, Chrome's print window opens: choose **Save as PDF** as the printer).
   Uploaded pictures are always included. Tick *Include linked pictures* to also put linked/website pictures inside the file so they show offline.
2. Send the `.html` file by email/Teams. Anyone can double-click it to open it in a browser, with no extension needed.
3. In ⋯ → Space settings → *Offline sharing*:
   - **Snapshot**: a frozen copy.
   - **Check for updates**: the file looks for a newer version when opened. With the company Forgejo (sign-in required) the file
     can't check by itself, so it shows **"Ask Avenous for the latest version"** with a ready-made email.

**Colleagues with TabNest** can follow your space live: give them **Read** access to the repo (repo → Settings → Collaborators).
They then import your `.html` file, or create a space → **Git repository** → **Follow (pull only)** → same file path.

## 5. Updating to a newer build

1. Replace the extension folder's contents with the new build (or run `npm run build` if you load `dist`).
2. Go to `chrome://extensions` → click ↻ (reload) on TabNest. Your spaces are kept.

## If something goes wrong

| Problem | Fix |
| --- | --- |
| New tab still shows Google | `chrome://extensions` → TabNest is **On**; open a new tab and choose **Keep it** if Chrome asks. |
| Blank new tab | Reload TabNest in `chrome://extensions`. If it's still blank: right-click the page → **Inspect** → **Console**, and send the red error text. |
| "Could not reach the server" | Check VPN / company network. (The localhost preview can't reach the company Forgejo; the installed extension can.) |
| Red **Sync problem** | Hover it to read the error. Usually **Update token**, or check the branch under *Change name or branch*. |
| Chrome warns about developer-mode extensions on start | Expected for unpacked extensions; click **Keep**/close it. |
| Removing TabNest | `chrome://extensions` → **Remove**. This deletes its local data; synced spaces stay in your repos. |
