// Stand-alone viewer embedded in every shared HTML file. Plain JS, no
// dependencies, works from file:// with no extension installed.
// Data lives in <script type="application/json" id="tabnest-data">.
(function () {
  'use strict';
  var dataEl = document.getElementById('tabnest-data');
  var bundle = JSON.parse(dataEl.textContent);
  var STORE = 'tabnest-share:';
  var state = { active: 0, query: '', updates: {}, status: {}, replaced: {}, problem: {}, tokenForm: {}, tokenDraft: '', remember: false, tokenFocus: false };
  var TOKEN = 'tabnest-token:';

  function safeGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function safeSet(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* storage blocked */ } }
  function newer(a, b) { return new Date(a).getTime() > new Date(b).getTime(); }
  function isSpaceFile(f) { return f && f.format === 'tabnest.space' && f.content && Array.isArray(f.content.collections); }

  // If the reader already loaded a newer version on an earlier visit, show that.
  bundle.spaces.forEach(function (s, i) {
    var saved = safeGet(STORE + s.id);
    if (!saved) return;
    try {
      var f = JSON.parse(saved);
      if (isSpaceFile(f) && newer(f.updatedAt, s.updatedAt)) {
        bundle.spaces[i] = Object.assign({}, f, { checkUrl: s.checkUrl });
        state.replaced[s.id] = true;
      }
    } catch (e) { /* ignore corrupt cache */ }
  });

  function el(tag, attrs, kids) {
    var n = document.createElement(tag);
    if (attrs) Object.keys(attrs).forEach(function (k) {
      if (k === 'text') n.textContent = attrs[k];
      else if (k.slice(0, 2) === 'on') n.addEventListener(k.slice(2), attrs[k]);
      else n.setAttribute(k, attrs[k]);
    });
    (kids || []).forEach(function (c) { if (c) n.appendChild(c); });
    return n;
  }
  function host(u) { try { return new URL(u).hostname.replace(/^www\./, ''); } catch (e) { return u; } }
  function safeUrl(u) { return /^(https?|ftp|file|mailto):/i.test(u) ? u : '#'; }
  function fmt(iso) { var d = new Date(iso); return isNaN(d) ? '' : d.toLocaleString(); }

  function icon(card) {
    var letter = el('span', { class: 'letter', text: (card.title || host(card.url) || '?').charAt(0).toUpperCase() });
    if (!card.favIconUrl || !/^https?:/i.test(card.favIconUrl)) return letter;
    var img = el('img', { src: card.favIconUrl, alt: '', loading: 'lazy', referrerpolicy: 'no-referrer' });
    img.onerror = function () { img.replaceWith(letter); };
    return img;
  }

  function copyLinks(col) {
    var text = col.cards.map(function (c) { return c.title + '\n' + c.url; }).join('\n\n');
    if (navigator.clipboard) navigator.clipboard.writeText(text);
  }

  function render() {
    var app = document.getElementById('app');
    app.textContent = '';
    var space = bundle.spaces[state.active];
    var q = state.query.toLowerCase();

    var side = el('nav', { class: 'side' }, [
      el('div', { class: 'brand' }, [el('i'), el('span', { text: 'TabNest' })]),
      el('h4', { text: 'Shared spaces' }),
    ]);
    bundle.spaces.forEach(function (s, i) {
      var dot = el('span', { class: 'dot' });
      dot.style.background = s.content.color;
      side.appendChild(el('button', { class: i === state.active ? 'on' : '', onclick: function () { state.active = i; render(); } }, [dot, el('span', { text: s.content.name })]));
    });

    var cardCount = space.content.collections.reduce(function (n, c) { return n + c.cards.length; }, 0);
    var dot = el('span', { class: 'dot' });
    dot.style.background = space.content.color;
    var search = el('input', { class: 'search', type: 'search', placeholder: 'Search links…', value: state.query });
    search.addEventListener('input', function () { state.query = search.value; render(); var s = document.querySelector('.search'); s.focus(); s.setSelectionRange(s.value.length, s.value.length); });

    var main = el('main', { class: 'main' }, [
      el('div', { class: 'head' }, [
        el('h1', null, [dot, el('span', { text: space.content.name })]),
        el('span', { class: 'meta', text: space.content.collections.length + (space.content.collections.length === 1 ? ' collection · ' : ' collections · ') + cardCount + (cardCount === 1 ? ' link' : ' links') + ' · version of ' + fmt(space.updatedAt) }),
        search,
      ]),
    ]);

    var up = state.updates[space.id];
    if (up) {
      main.appendChild(el('div', { class: 'banner' }, [
        el('span', { text: 'A newer version of “' + up.content.name + '” is available (' + fmt(up.updatedAt) + ').' }),
        el('button', { class: 'primary', text: 'Show update', onclick: function () { applyUpdate(space.id); } }),
        el('button', { text: 'Ignore', onclick: function () { safeSet(STORE + 'ignore:' + space.id, up.updatedAt); delete state.updates[space.id]; render(); } }),
      ]));
    }
    if (state.replaced[space.id]) {
      main.appendChild(el('div', { class: 'banner' }, [
        el('span', { text: 'You are seeing a newer version than the one saved in this file.' }),
        el('button', { text: 'Save updated file', onclick: saveCopy }),
      ]));
    }
    if (state.problem[space.id]) main.appendChild(problemBanner(space, state.problem[space.id]));
    else if (state.status[space.id]) main.appendChild(el('div', { class: 'status', text: state.status[space.id] }));

    var shown = 0;
    space.content.collections.forEach(function (col) {
      var cards = col.cards.filter(function (c) {
        return !q || (c.title + ' ' + c.url + ' ' + (c.note || '')).toLowerCase().indexOf(q) !== -1;
      });
      if (q && !cards.length) return;
      shown += cards.length;
      var grid = el('div', { class: 'grid' });
      cards.forEach(function (c) {
        grid.appendChild(el('a', { class: 'card', href: safeUrl(c.url), target: '_blank', rel: 'noopener noreferrer', title: c.url }, [
          el('div', { class: 't' }, [icon(c), el('span', { text: c.title || c.url })]),
          c.note ? el('div', { class: 'n', text: c.note }) : null,
          el('div', { class: 'h', text: host(c.url) }),
        ]));
      });
      main.appendChild(el('section', { class: 'col' }, [
        el('div', { class: 'col-head' }, [
          el('h2', { text: col.name }),
          el('span', { class: 'meta', text: col.cards.length + (col.cards.length === 1 ? ' link' : ' links') }),
          el('button', { text: 'Copy links', onclick: function () { copyLinks(col); } }),
        ]),
        grid,
      ]));
    });
    if (!shown) main.appendChild(el('div', { class: 'empty', text: q ? 'No links match “' + state.query + '”.' : 'This space is empty.' }));
    var by = bundle.sharedBy && bundle.sharedBy.name ? ' by ' + bundle.sharedBy.name : '';
    main.appendChild(el('div', { class: 'foot', text: 'Shared' + by + ' from TabNest on ' + fmt(bundle.exportedAt) + '. Have the TabNest extension? Use Import to add this file to your spaces.' }));

    app.appendChild(el('div', { class: 'layout' }, [bundle.spaces.length > 1 ? side : null, main]));
    var tok = document.querySelector('.token-input');
    if (tok && state.tokenFocus) { tok.focus(); tok.setSelectionRange(tok.value.length, tok.value.length); }
  }

  function applyUpdate(id) {
    var up = state.updates[id];
    bundle.spaces = bundle.spaces.map(function (s) { return s.id === id ? Object.assign({}, up, { checkUrl: s.checkUrl }) : s; });
    safeSet(STORE + id, JSON.stringify(up));
    delete state.updates[id];
    state.replaced[id] = true;
    render();
  }

  // Download this page again with the newer data baked in.
  function saveCopy() {
    var clone = document.documentElement.cloneNode(true);
    clone.querySelector('#app').textContent = '';
    var copy = Object.assign({}, bundle, { exportedAt: new Date().toISOString() });
    clone.querySelector('#tabnest-data').textContent = JSON.stringify(copy).replace(/</g, '\\u003c');
    var blob = new Blob(['<!doctype html>\n' + clone.outerHTML], { type: 'text/html' });
    var a = el('a', { href: URL.createObjectURL(blob), download: (document.title || 'tabnest-share').replace(/[^\w\- ]+/g, '') + '.html' });
    document.body.appendChild(a);
    a.click();
    a.remove();
  }

  function originOf(u) { try { return new URL(u).origin; } catch (e) { return ''; } }
  function isGithubRaw(u) { return /^https:\/\/raw\.githubusercontent\.com\//.test(u); }

  // Shown when the file could not check for a newer version: explains why and
  // offers the ways forward (ask the owner, open the source, sign in with a token).
  function problemBanner(space, problem) {
    var owner = bundle.sharedBy || {};
    var who = owner.name || 'the person who sent you this file';
    var reasons = {
      failed: 'The source needs you to be signed in (or you are offline / off the company network).',
      denied: 'The token was not accepted. It needs read access to this repository.',
      blocked: 'The server could not be reached, or it does not allow checks from shared files yet (the Forgejo admin can turn this on with the CORS setting).',
    };
    var kids = [
      el('span', { text: 'Could not check for a newer version of “' + space.content.name + '”. ' + reasons[problem] + ' This copy is from ' + fmt(space.updatedAt) + '.' }),
    ];
    var email = /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(owner.contact || '') ? owner.contact : '';
    if (email) {
      var subject = 'Latest version of "' + space.content.name + '"';
      var body = 'Hi ' + (owner.name || '') + ',\n\nCould you send me the latest TabNest file for "' + space.content.name + '"? My copy is from ' + fmt(space.updatedAt) + '.\n\nThanks';
      kids.push(el('a', { class: 'btn primary', href: 'mailto:' + email + '?subject=' + encodeURIComponent(subject) + '&body=' + encodeURIComponent(body), text: 'Ask ' + (owner.name || email) + ' for the latest version' }));
    } else {
      kids.push(el('span', { class: 'ask', text: 'Ask ' + who + (owner.contact ? ' (' + owner.contact + ')' : '') + ' for the latest version.' }));
    }
    if (space.sourceUrl) kids.push(el('a', { class: 'btn', href: space.sourceUrl, target: '_blank', rel: 'noopener noreferrer', text: 'Open source (' + host(space.sourceUrl) + ')' }));
    if (!isGithubRaw(space.checkUrl)) {
      kids.push(el('button', { text: 'Sign in with a token', onclick: function () { state.tokenForm[space.id] = !state.tokenForm[space.id]; render(); } }));
    }
    kids.push(el('button', { text: 'Try again', onclick: function () { check(space); } }));

    var box = el('div', { class: 'banner warn' }, kids);
    if (state.tokenForm[space.id]) {
      var origin = originOf(space.checkUrl);
      var input = el('input', { class: 'token-input', type: 'password', placeholder: 'Paste an access token', value: state.tokenDraft, autocomplete: 'off' });
      input.addEventListener('input', function () { state.tokenDraft = input.value; });
      input.addEventListener('focus', function () { state.tokenFocus = true; });
      input.addEventListener('blur', function () { state.tokenFocus = false; });
      var remember = el('input', { type: 'checkbox' });
      remember.checked = state.remember;
      remember.addEventListener('change', function () { state.remember = remember.checked; });
      var saved = safeGet(TOKEN + origin);
      box.appendChild(el('div', { class: 'token-form' }, [
        el('p', { text: 'Create a token in ' + host(origin) + ' → Settings → Applications, with read access to repositories. It is sent only to ' + host(origin) + '.' }),
        input,
        el('label', null, [remember, el('span', { text: ' Remember on this computer (only do this on your own PC)' })]),
        el('button', { class: 'primary', text: 'Check', onclick: function () {
          var t = state.tokenDraft.trim();
          if (!t) return;
          if (state.remember) safeSet(TOKEN + origin, t);
          state.tokenDraft = '';
          check(space, t);
        } }),
        saved ? el('button', { text: 'Forget saved token', onclick: function () { try { localStorage.removeItem(TOKEN + origin); } catch (e) { /* ignore */ } render(); } }) : null,
      ]));
    }
    return box;
  }

  function check(s, token) {
    if (!s.checkUrl || typeof fetch !== 'function') return;
    var saved = token || safeGet(TOKEN + originOf(s.checkUrl)) || '';
    var opts = { cache: 'no-store' };
    if (saved) opts.headers = { Authorization: 'token ' + saved };
    state.status[s.id] = 'Checking for updates…';
    render();
    fetch(s.checkUrl, opts)
      .then(function (r) {
        if (r.status === 401 || r.status === 403 || r.status === 404) throw { kind: saved ? 'denied' : 'failed' };
        if (!r.ok) throw { kind: 'failed' };
        return r.json();
      })
      .then(function (f) {
        if (!isSpaceFile(f)) throw { kind: 'failed' };
        delete state.problem[s.id];
        state.tokenForm[s.id] = false;
        var current = bundle.spaces.filter(function (x) { return x.id === s.id; })[0];
        if (newer(f.updatedAt, current.updatedAt) && safeGet(STORE + 'ignore:' + s.id) !== f.updatedAt) {
          state.updates[s.id] = f;
          delete state.status[s.id];
        } else state.status[s.id] = 'Checked for updates: this is the latest version.';
        render();
      })
      .catch(function (e) {
        // A network-level failure with a token usually means the server refused the cross-site request (CORS).
        var kind = e && e.kind ? e.kind : saved ? 'blocked' : 'failed';
        state.problem[s.id] = kind;
        delete state.status[s.id];
        render();
      });
  }

  function checkForUpdates() {
    bundle.spaces.forEach(function (s) { check(s); });
  }

  render();
  checkForUpdates();
})();
