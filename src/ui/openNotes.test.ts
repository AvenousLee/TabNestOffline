import { describe, expect, it } from 'vitest';
import { dropDraft, getDraft, setDraft } from './openNotes';

describe('drafts of unsaved locked descriptions', () => {
  it('belong to the saved version they were made from', () => {
    setDraft('card', { basedOn: 'v1.a.b.c', draftLock: 'v1.d.e.f' });
    expect(getDraft('card', 'v1.a.b.c')?.draftLock).toBe('v1.d.e.f');
    // The description was changed elsewhere (e.g. synced): the old draft no longer applies and is dropped.
    expect(getDraft('card', 'v1.x.y.z')).toBeUndefined();
    expect(getDraft('card', 'v1.a.b.c')).toBeUndefined();
  });

  it('are gone after saving or discarding', () => {
    setDraft('card', { basedOn: 'v1.a.b.c', draftLock: 'v1.d.e.f' });
    dropDraft('card');
    expect(getDraft('card', 'v1.a.b.c')).toBeUndefined();
  });
});
