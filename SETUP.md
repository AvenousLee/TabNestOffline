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
- **Rename:** double-click a space or collection name, or use **⋯ → Rename** next to a space in the sidebar.
- **Search:** press `/` and type. Search covers every space.
- **More room:** click « (top of the sidebar) to shrink the left side to space icons, and » (Open Tabs) to hide the right side.
  Or press `[` and `]`. TabNest remembers your choice.
- **Note cards:** click **+** in a collection and leave **Link** empty to keep a quick note (title and/or description). Click the note to edit it.
- **Pictures and descriptions:** click ✏️ on a card. Add a description (up to 500 characters; the card shows 3 lines, hover for the rest).
  Pictures are optional: tick **Add a picture** to show the picture options.
  Add a picture by **Upload image**, dropping a file, pasting a screenshot (Ctrl+V), pasting an image link, or **Use website preview**.
  Uploaded pictures are shrunk (about 480px wide) and travel with the space, so they sync and show in shared files offline.
  Tick *Automatically add website previews* to get pictures whenever you save tabs (Chrome asks once for access to all websites).
- **Spaces:** **+ Create Space** in the sidebar. Drag spaces up or down to reorder them.
  **⋯** in the space header opens **Space settings** (tabs: *General* for name, colour and default space; *Sync*; *Sharing*).
  For the colour, pick one of the swatches, or **+** for any colour (colour picker, or a code like `#3a7bd5` / `rgb(58, 123, 213)`).
- **Default space:** the space every new tab opens on (🏠). Set it with **⋯ → Set as default space** next to a space, in Space settings,
  or in **Settings → General**. Without a choice, it's the first space in the list.
- **Copy or move collections** to another space: **Copy / move…** above the collections, the copy icon on a collection, or drag a
  collection onto a space in the sidebar (hold **Ctrl** to copy).
- **Narrow window:** the sidebar turns into an icon strip; » slides it open over the page.

## Private descriptions (hide or password)

In a card's editor (✏️), **Who can read the description**:

- **Hidden:** the card shows "Hidden description · show" until you click it. Handy for screen sharing, but **not secret**.
- **Password:** the description is encrypted with your **master password**. Set the master password the first time
  (TabNest offers it right there, or **Settings → General → Master password & privacy**).
  To read it, click **🔒 Locked description · unlock** on the card and type the password, every time.

Opened descriptions close by themselves after a while without use (5 minutes by default, and when you switch tabs); change this in
**Settings → General**. If that happens while you're editing, your changes are kept and come back when you unlock again.

⚠ **Nobody can recover a forgotten master password**, and locked descriptions can't be opened without it.
**Change master password…** re-locks all of them with the new one.

## Settings

**Settings** is at the bottom of the sidebar: *General* (profile, default space, previews, side panels, master password, auto-hide),
*Calendar*, *Git sync*, *Backup & restore* and *About TabNest*.

## Calendar

1. Click **Calendar** at the top of the sidebar (one calendar page; spaces stay for your tabs).
2. Next to **Other calendars** click **+** and paste an **iCal address**:
   - **Google Calendar:** Settings → your calendar → *Integrate calendar* → **Secret address in iCal format**.
   - **Outlook / Office 365:** Settings → Calendar → *Shared calendars* → *Publish a calendar* → copy the **ICS** link.
   Chrome asks once to allow that website → **Allow**.
3. Tick/untick a calendar to show/hide it. Hover it for **✎** (name, link, colour) and **🗑** (delete); **⋯** has colour and *Refresh now*.
4. Switch between **Year / Month / Week / Agenda**; click an event for details and links.

Linked calendars are **view only** (create and cancel events in Google/Outlook/webmail; they appear within ~15 minutes, or press ↻).
Calendar links stay **on this device** (a secret address works like a password), so link them again on another computer.

**Webmail calendars** (e.g. cPanel webmail): next to **Other calendars** click **+** → **Webmail calendar**, paste the CalDAV address
(cPanel: `https://mail.yourcompany.com:2080/calendars/you@yourcompany.com/calendar`), your full email address and its password.

The whole Calendar can be switched off in **Settings → Calendar → Use the Calendar** (your calendars are kept).

## Google sign-in (optional)

To **add, change and delete** events in your own Google calendars, turn on **Settings → Calendar → Sign in with Google accounts**.
To only *see* a Google calendar you don't need this: link its secret iCal address (above).

**Why you need your own Google client ID:** TabNest is a free, open-source app with no server or company behind it. Google only lets an
app sign in to Google Calendar with a "client ID" registered to a person, who answers to Google for it (its limits, its review and its
users). So TabNest doesn't ship one: you create your own, free, once, in about 10 minutes, and it stays under your control.

One-time setup in Google Cloud (free, no credit card), with any Google account:

1. Open [console.cloud.google.com](https://console.cloud.google.com/projectcreate) and create a project, e.g. "TabNest".
2. *APIs & Services → Library*: search **Google Calendar API** and click **Enable**.
3. *Google Auth Platform → Branding* (or *OAuth consent screen*): app name "TabNest", your email. Audience: **External**, leave it in
   **Testing** and add every Google account you will sign in with under **Test users**.
4. *Clients → Create client*: type **Web application**. Under **Authorised redirect URIs** add this copy's address, shown in TabNest
   (Settings → Calendar → *Open the setup guide*). It looks like `https://<extension id>.chromiumapp.org/`.
5. Create, then copy the **Client ID** into **Settings → Calendar → Google client ID**.
6. On the Calendar page, click **+** next to **My calendars**, sign in, and tick the calendars to show. Repeat for each account
   (**⋯** next to an account → *Choose calendars…* changes the list later).
7. **Create** (top of the calendar) adds an event; click an event for **Edit** / **Delete**. Invitations from other people stay view only,
   and a repeating event changes one date at a time.

A copy of TabNest loaded from another folder (or from a store) has a different redirect address: add that one too.
Company Google Workspace accounts may need the IT admin to allow the app.

## 3. Sync a space with Git

1. Create a repository (GitHub, GitLab or your company Forgejo). Private is fine, and so is an empty one.
2. In TabNest open the space → click **Not synced** (next to Share; it opens *Space settings → Sync*) → **Git repository**.
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
3. In ⋯ → Space settings → **Sharing**:
   - **Snapshot**: a frozen copy.
   - **Check for updates**: the file looks for a newer version when opened. With the company Forgejo (sign-in required) the file
     can't check by itself, so it shows **"Ask <owner> for the latest version"** with a ready-made email.

**Colleagues with TabNest** can follow your space live: give them **Read** access to the repo (repo → Settings → Collaborators).
They then import your `.html` file, or create a space → **Git repository** → **Follow (pull only)** → same file path.

**Owner:** the first time you share a space, your name and contact from **Shared by** become its **owner**. The owner stays with the space
when others import or re-share it (they show up as "Shared by"), so anyone holding a copy (HTML or PDF) can reach the original owner.

## 5. Move TabNest to another device (backup & restore)

1. On this device: **Settings → Backup & restore** → **Download backup**. Tick *Include secrets* only if you want Git tokens,
   webmail passwords and iCal links in the file too (keep that file private).
2. On the other device: install TabNest (step 1) → **Settings → Backup & restore** → **Restore from backup…** → choose the file.
   This replaces whatever is in TabNest there.
3. Sign in to your Google accounts again (Calendar → **Sign in again** next to each account). Locked descriptions open with the same password.

## 6. Updating to a newer version

1. **Settings → About TabNest → Check for updates.** It compares your version with the latest release on GitHub.
2. If a newer version is available, click **Download TabNest x.y.z (.zip)**.
3. Unzip it **into the same folder** TabNest is loaded from now, replacing the old files. Use the same folder every time:
   Chrome keeps your spaces with that folder, and a different folder starts empty.
4. Click **Reload TabNest** (in the same place), or ↻ on TabNest in `chrome://extensions`. Your spaces are kept.

TabNest can't replace its own files (Chrome only lets store installs update by themselves), so steps 3 and 4 are yours.
If you build from the source instead, run `npm run build` and reload.

## If something goes wrong

| Problem | Fix |
| --- | --- |
| New tab still shows Google | `chrome://extensions` → TabNest is **On**; open a new tab and choose **Keep it** if Chrome asks. |
| Blank new tab | Reload TabNest in `chrome://extensions`. If it's still blank: right-click the page → **Inspect** → **Console**, and send the red error text. |
| "Could not reach the server" | Check VPN / company network. (The localhost preview can't reach the company Forgejo; the installed extension can.) |
| Red **Sync problem** | Hover it to read the error. Usually **Update token**, or check the branch under *Change name or branch*. |
| Chrome warns about developer-mode extensions on start | Expected for unpacked extensions; click **Keep**/close it. |
| Removing TabNest | Download a backup first (Settings → Backup & restore). `chrome://extensions` → **Remove** deletes its local data; synced spaces stay in your repos. |
| Forgot the master password | It can't be recovered. Locked descriptions stay locked; other content is unaffected. |
