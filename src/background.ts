// Service worker: checks synced spaces on a timer so updates arrive (or get
// flagged on the toolbar badge) even when no TabNest tab is open.

import { loadAll, loadSpace, savePending, saveSpace } from './storage/storage';
import { mergeSyncResult, syncSpace } from './sync/engine';
import { setBadge } from './browser/tabs';

const ALARM = 'tabnest-sync';
const PERIOD_MINUTES = 15;

async function checkAll(): Promise<void> {
  const { spaces, remotes, pending: initial } = await loadAll();
  let pending = initial;
  for (const space of spaces) {
    // Already waiting on the user for this space: don't re-prompt or auto-act.
    if (!space.sync || pending.some((p) => p.spaceId === space.id)) continue;
    const res = await syncSpace(space, remotes, { manual: false });
    const current = await loadSpace(space.id);
    if (!current) continue;
    const merged = await mergeSyncResult(current, space, res.space);
    if (merged) await saveSpace(merged);
    if (res.pending) pending = [...pending.filter((p) => p.spaceId !== space.id), res.pending];
  }
  if (pending !== initial) await savePending(pending);
  setBadge(pending.length);
}

chrome.runtime.onInstalled.addListener(() => {
  void chrome.alarms.create(ALARM, { periodInMinutes: PERIOD_MINUTES, delayInMinutes: 1 });
});

chrome.runtime.onStartup.addListener(() => {
  void chrome.alarms.create(ALARM, { periodInMinutes: PERIOD_MINUTES, delayInMinutes: 1 });
  void checkAll();
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === ALARM) void checkAll();
});

chrome.action.onClicked.addListener(() => {
  void chrome.tabs.create({ url: chrome.runtime.getURL('newtab.html') });
});
