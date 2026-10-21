import { useEffect, useRef, useState } from 'react';
import { NOTE_MAX } from '../../types';
import { useStore } from '../../store/store';
import { requestHostAccess } from '../../browser/tabs';
import { isSafeImage } from '../../lib/spaceFile';
import { dataUrlBytes, fetchPreviewImage, shrinkImage } from '../../lib/image';
import { Field, Modal } from '../Modal';
import { Icon } from '../icons';
import type { CardTarget } from '../SpaceView';

/** Spaces bigger than this sync noticeably slower; warn when pictures push past it. */
const BIG_SPACE_BYTES = 3_000_000;
const ALL_SITES = ['https://*', 'http://*'];

export function CardDialog({ target, onClose }: { target: CardTarget; onClose: () => void }) {
  const s = useStore();
  const [title, setTitle] = useState(target.card?.title ?? '');
  const [url, setUrl] = useState(target.card?.url ?? '');
  const [note, setNote] = useState(target.card?.note ?? '');
  const [image, setImage] = useState(target.card?.image ?? '');
  // Pictures are optional: the section stays hidden until ticked (or the card already has one).
  const [withPicture, setWithPicture] = useState(!!target.card?.image);
  const [imageLink, setImageLink] = useState('');
  const [busy, setBusy] = useState('');
  const [problem, setProblem] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  const normalized = /^[a-z][a-z0-9+.-]*:/i.test(url.trim()) ? url.trim() : url.trim() ? `https://${url.trim()}` : '';
  let linkOk = false;
  try {
    linkOk = !!new URL(normalized);
  } catch {
    linkOk = false;
  }
  // The link is optional: without one the card is a note (needs a title or a description).
  const hasLink = url.trim() !== '';
  const valid = hasLink ? linkOk : !!(title.trim() || note.trim());

  const pickFile = async (file: Blob | null | undefined) => {
    if (!file) return;
    setProblem('');
    setBusy('Shrinking the picture…');
    try {
      setImage(await shrinkImage(file));
      setWithPicture(true);
    } catch (e) {
      setProblem(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy('');
    }
  };

  // Ctrl+V a screenshot anywhere in the dialog.
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const item = [...(e.clipboardData?.items ?? [])].find((i) => i.type.startsWith('image/'));
      if (item) {
        e.preventDefault();
        void pickFile(item.getAsFile());
      }
    };
    window.addEventListener('paste', onPaste);
    return () => window.removeEventListener('paste', onPaste);
  }, []);

  // Runs from a click so Chrome can ask for access to that website.
  const grabPreview = async () => {
    if (!linkOk) return;
    setProblem('');
    try {
      if (!(await requestHostAccess(new URL(normalized).origin))) throw new Error('TabNest needs permission to read that website to get its preview.');
      setBusy('Looking for the website preview…');
      const found = await fetchPreviewImage(normalized);
      if (found) setImage(found);
      else setProblem('This page has no preview picture.');
    } catch (e) {
      setProblem(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy('');
    }
  };

  const toggleAuto = async (on: boolean) => {
    // Automatic previews read every saved page, so they need access to all websites (asked once).
    if (on && !(await requestHostAccess(ALL_SITES))) return;
    s.savePrefs({ ...s.prefs, autoPreview: on });
  };

  const save = () => {
    if (!valid) return;
    // A note card with only a description: its first line becomes the title (not shown twice).
    const noteTitle = note.trim().split('\n')[0].slice(0, 60);
    const data = {
      title: title.trim() || (hasLink ? normalized : noteTitle),
      url: hasLink ? normalized : '',
      note: (hasLink || title.trim() ? note.trim() : note.trim().slice(noteTitle.length).trim()) || undefined,
      image: (withPicture && image) || undefined,
    };
    if (target.card) s.updateCard(target.spaceId, target.colId, target.card.id, data);
    else s.addCard(target.spaceId, target.colId, data);
    const space = useStore.getState().spaces.find((sp) => sp.id === target.spaceId);
    if (withPicture && image.startsWith('data:') && space && JSON.stringify(space).length > BIG_SPACE_BYTES) {
      s.showToast(`“${space.name}” is getting large because of its pictures. Syncing may be slower; consider image links instead of uploads.`);
    }
    onClose();
  };

  return (
    <Modal
      title={target.card ? 'Edit card' : 'Add card'}
      onClose={onClose}
      wide
      footer={
        <>
          <button className="btn ghost" onClick={onClose}>
            Cancel
          </button>
          <button className="btn primary" disabled={!valid || !!busy} onClick={save}>
            Save
          </button>
        </>
      }
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          save();
        }}
      >
        <Field label="Link (optional)" hint={hasLink && !linkOk ? 'That doesn’t look like a web address.' : 'Leave empty to make a note card, e.g. for a temporary note.'}>
          <input autoFocus value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://…" />
        </Field>
        <Field label="Title">
          <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Shown on the card" />
        </Field>
        <Field label="Description" hint={`${note.length}/${NOTE_MAX} · the card shows 3 lines; hover it to read the rest.`}>
          <textarea rows={3} maxLength={NOTE_MAX} value={note} onChange={(e) => setNote(e.target.value.slice(0, NOTE_MAX))} />
        </Field>
        <button type="submit" hidden />
      </form>

      <label className="check">
        <input type="checkbox" checked={withPicture} onChange={(e) => setWithPicture(e.target.checked)} />
        Add a picture <span className="muted small">(optional)</span>
      </label>
      {withPicture && (
      <>
      <div
        className="picture-box"
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          void pickFile(e.dataTransfer.files[0]);
        }}
      >
        {image ? (
          <img className="picture-preview" src={image} alt="" referrerPolicy="no-referrer" onError={() => setProblem('That picture could not be loaded.')} />
        ) : (
          <div className="picture-empty">
            <Icon name="upload" size={20} />
            <span>Drop an image here, or paste one with Ctrl+V</span>
          </div>
        )}
        <div className="picture-actions">
          <button type="button" className="btn" onClick={() => fileRef.current?.click()}>
            Upload image
          </button>
          <button type="button" className="btn" disabled={!linkOk || !!busy} onClick={() => void grabPreview()} title="Use the picture the website shows when its link is shared">
            Use website preview
          </button>
          {image && (
            <button type="button" className="btn ghost" onClick={() => setImage('')}>
              Remove
            </button>
          )}
          <input ref={fileRef} type="file" accept="image/*" hidden onChange={(e) => void pickFile(e.target.files?.[0])} />
        </div>
        <div className="row">
          <input
            value={imageLink}
            onChange={(e) => setImageLink(e.target.value)}
            placeholder="…or paste an image link (https://…/picture.png)"
            onKeyDown={(e) => {
              if (e.key === 'Enter' && isSafeImage(imageLink.trim())) {
                e.preventDefault();
                setImage(imageLink.trim());
                setImageLink('');
              }
            }}
          />
          <button
            type="button"
            className="btn"
            disabled={!/^https?:\/\//i.test(imageLink.trim())}
            onClick={() => {
              setImage(imageLink.trim());
              setImageLink('');
            }}
          >
            Use link
          </button>
        </div>
        {busy && <div className="muted small">{busy}</div>}
        {problem && <div className="status-line warn">{problem}</div>}
        {image.startsWith('data:') && <div className="muted small">Uploaded picture, stored with the space ({Math.round(dataUrlBytes(image) / 1024)} KB). Syncs and works offline.</div>}
        {/^https?:/.test(image) && <div className="muted small">Linked picture: shows only when the viewer can reach that address.</div>}
      </div>
      <label className="check">
        <input type="checkbox" checked={s.prefs.autoPreview} onChange={(e) => void toggleAuto(e.target.checked)} />
        Automatically add website previews when I save tabs (Chrome asks once for access to all websites)
      </label>
      </>
      )}
    </Modal>
  );
}
