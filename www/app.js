/* =========================================================
   Lector PDF — app offline para Android
   pdf.js (render) + Capacitor (WebView nativa)
   ========================================================= */
(function () {
  'use strict';

  var PDFJS = window.pdfjsLib;
  PDFJS.GlobalWorkerOptions.workerSrc = 'vendor/pdf.worker.min.js';

  var CFG = {
    cMapUrl: 'vendor/cmaps/',
    cMapPacked: true,
    standardFontDataUrl: 'vendor/standard_fonts/'
  };

  /* ---------------------------------------------------------
     Utilidades
  --------------------------------------------------------- */
  var $ = function (sel, root) { return (root || document).querySelector(sel); };
  var $$ = function (sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); };

  function uid() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  }
  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function fmtBytes(b) {
    if (!b) return '0 KB';
    var u = ['B', 'KB', 'MB', 'GB'], i = 0;
    while (b >= 1024 && i < u.length - 1) { b /= 1024; i++; }
    return (b < 10 ? b.toFixed(1) : Math.round(b)) + ' ' + u[i];
  }
  function fmtDate(ts) {
    try {
      return new Date(ts).toLocaleDateString('es', { day: '2-digit', month: 'short', year: 'numeric' });
    } catch (e) { return ''; }
  }

  var toastTimer = null;
  function toast(msg) {
    var el = $('#toast');
    el.textContent = msg;
    el.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { el.classList.remove('show'); }, 2400);
  }

  /* ---------------------------------------------------------
     IndexedDB (sin dependencias)
  --------------------------------------------------------- */
  var DB = null;
  var STORES = ['books', 'files', 'folders', 'kv'];

  function openDB() {
    return new Promise(function (resolve, reject) {
      var req = indexedDB.open('lectorPDF', 3);
      req.onupgradeneeded = function (e) {
        var db = e.target.result;
        STORES.forEach(function (s) {
          if (!db.objectStoreNames.contains(s)) {
            db.createObjectStore(s, s === 'kv' ? undefined : { keyPath: 'id' });
          }
        });
      };
      req.onsuccess = function () { DB = req.result; resolve(DB); };
      req.onerror = function () { reject(req.error); };
    });
  }

  function dbAll(store) {
    return new Promise(function (res, rej) {
      var r = DB.transaction(store, 'readonly').objectStore(store).getAll();
      r.onsuccess = function () { res(r.result || []); };
      r.onerror = function () { rej(r.error); };
    });
  }
  function dbGet(store, key) {
    return new Promise(function (res, rej) {
      var r = DB.transaction(store, 'readonly').objectStore(store).get(key);
      r.onsuccess = function () { res(r.result); };
      r.onerror = function () { rej(r.error); };
    });
  }
  function dbPut(store, val) {
    return new Promise(function (res, rej) {
      var r = DB.transaction(store, 'readwrite').objectStore(store).put(val);
      r.onsuccess = function () { res(true); };
      r.onerror = function () { rej(r.error); };
    });
  }
  function dbDel(store, key) {
    return new Promise(function (res, rej) {
      var r = DB.transaction(store, 'readwrite').objectStore(store).delete(key);
      r.onsuccess = function () { res(true); };
      r.onerror = function () { rej(r.error); };
    });
  }

  /* ---------------------------------------------------------
     Estado
  --------------------------------------------------------- */
  var state = {
    books: [],
    folders: [],
    folder: 'all',
    query: '',
    searching: false,
    settings: {
      theme: 'light',     // light | sepia | dark  (interfaz)
      pdfMode: 'light',   // light | sepia | night   (páginas del PDF)
      brightness: 1,
      zoom: 1,
      ttsRate: 1,
      ttsLang: 'es-ES'
    }
  };

  function loadSettings() {
    try {
      var raw = localStorage.getItem('lector.settings.v1');
      if (raw) Object.assign(state.settings, JSON.parse(raw));
    } catch (e) { }
    applySettings();
  }
  function saveSettings() {
    try { localStorage.setItem('lector.settings.v1', JSON.stringify(state.settings)); } catch (e) { }
  }
  function applySettings() {
    document.documentElement.setAttribute('data-theme', state.settings.theme);
    document.body.setAttribute('data-pdf', state.settings.pdfMode);
    document.body.style.setProperty('--bright', String(state.settings.brightness));
    var tc = $('#meta-theme');
    if (tc) tc.setAttribute('content', getComputedStyle(document.body).backgroundColor);
  }

  /* ---------------------------------------------------------
     Biblioteca
  --------------------------------------------------------- */
  function folderName(id) {
    if (!id) return '';
    var f = state.folders.filter(function (x) { return x.id === id; })[0];
    return f ? f.name : '';
  }

  function visibleBooks() {
    var q = state.query.trim().toLowerCase();
    return state.books
      .filter(function (b) {
        if (state.folder !== 'all' && (b.folder || '') !== state.folder) return false;
        if (!q) return true;
        return (b.title || '').toLowerCase().indexOf(q) >= 0 ||
          (b.author || '').toLowerCase().indexOf(q) >= 0;
      })
      .sort(function (a, b) { return (b.opened || b.added) - (a.opened || a.added); });
  }

  function renderFolders() {
    var wrap = $('#folder-chips');
    var html = '<button class="chip' + (state.folder === 'all' ? ' active' : '') + '" data-folder="all">Todos (' + state.books.length + ')</button>';
    state.folders.forEach(function (f) {
      var n = state.books.filter(function (b) { return b.folder === f.id; }).length;
      html += '<button class="chip' + (state.folder === f.id ? ' active' : '') + '" data-folder="' + esc(f.id) + '">' + esc(f.name) + ' (' + n + ')</button>';
    });
    wrap.innerHTML = html;

    var t = state.folder === 'all' ? 'Mi biblioteca' : folderName(state.folder);
    $('#lib-title').textContent = t;
  }

  function renderLibrary() {
    renderFolders();
    var books = visibleBooks();
    var grid = $('#book-grid');
    var empty = $('#empty-state');

    if (!books.length) {
      grid.innerHTML = '';
      empty.classList.remove('hidden');
      if (state.query || state.folder !== 'all') {
        empty.querySelector('h2').textContent = 'Sin resultados';
        empty.querySelector('p').innerHTML = 'No hay libros que coincidan con este filtro.';
      } else {
        empty.querySelector('h2').textContent = 'Tu biblioteca está vacía';
        empty.querySelector('p').innerHTML = 'Toca el botón <b>+</b> para agregar un PDF de tu teléfono.<br />Los libros se guardan dentro de la app y se leen sin internet.';
      }
      return;
    }
    empty.classList.add('hidden');

    grid.innerHTML = books.map(function (b) {
      var pct = b.pages ? Math.round(((b.lastPage || 1) / b.pages) * 100) : 0;
      var cover = b.thumb
        ? '<img src="' + b.thumb + '" alt="" loading="lazy" />'
        : '<div class="fallback">' + esc(b.title) + '</div>';
      return '' +
        '<div class="book-card" data-id="' + b.id + '">' +
          '<div class="cover">' + cover +
            (pct > 0 ? '<span class="pct">' + pct + '%</span>' : '') +
            '<span class="bar"><i style="width:' + pct + '%"></i></span>' +
          '</div>' +
          '<div class="book-meta">' +
            '<div class="book-title">' + esc(b.title) + '</div>' +
            '<div class="book-sub">' + esc(b.author || fmtDate(b.added)) + ' · ' + b.pages + ' pág.</div>' +
          '</div>' +
        '</div>';
    }).join('');
  }

  async function importFiles(fileList) {
    var files = Array.prototype.slice.call(fileList || []);
    files = files.filter(function (f) { return /\.pdf$/i.test(f.name) || f.type === 'application/pdf'; });
    if (!files.length) { toast('Selecciona archivos PDF'); return; }

    toast('Importando ' + files.length + (files.length === 1 ? ' libro…' : ' libros…'));

    for (var i = 0; i < files.length; i++) {
      var f = files[i];
      var doc = null;
      try {
        var buf = await f.arrayBuffer();
        doc = await PDFJS.getDocument(Object.assign({ data: new Uint8Array(buf) }, CFG)).promise;

        var info = {};
        try { info = (await doc.getMetadata()).info || {}; } catch (e) { }

        var title = (info.Title || '').trim() || f.name.replace(/\.pdf$/i, '').trim();
        var author = (info.Author || '').trim();

        var thumb = '';
        try { thumb = await makeThumbnail(doc); } catch (e) { }

        var book = {
          id: uid(),
          title: title.slice(0, 200),
          author: author.slice(0, 120),
          pages: doc.numPages,
          size: f.size,
          added: Date.now(),
          opened: Date.now(),
          folder: state.folder === 'all' ? null : state.folder,
          lastPage: 1,
          loc: 0,
          thumb: thumb
        };

        await dbPut('books', book);
        await dbPut('files', { id: book.id, blob: f, name: f.name });
        state.books.push(book);
      } catch (e) {
        console.error(e);
        toast('No se pudo abrir “' + f.name + '”');
      } finally {
        if (doc) { try { doc.destroy(); } catch (e) { } }
      }
    }

    renderLibrary();
  }

  async function makeThumbnail(doc) {
    var page = await doc.getPage(1);
    var vp1 = page.getViewport({ scale: 1 });
    var scale = 320 / vp1.width;
    var vp = page.getViewport({ scale: scale });
    var canvas = document.createElement('canvas');
    canvas.width = Math.round(vp.width);
    canvas.height = Math.round(vp.height);
    var ctx = canvas.getContext('2d');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    await page.render({ canvasContext: ctx, viewport: vp }).promise;
    return canvas.toDataURL('image/jpeg', 0.82);
  }

  /* ---------------------------------------------------------
     Hojas modales
  --------------------------------------------------------- */
  var sheetStack = [];

  function openSheet(opts) {
    var root = $('#modal-root');
    var back = document.createElement('div');
    back.className = 'backdrop';
    back.innerHTML =
      '<div class="sheet">' +
        '<div class="grab"></div>' +
        (opts.title ? '<h3>' + esc(opts.title) + '</h3>' : '') +
        '<div class="body"></div>' +
        (opts.actions ? '<div class="actions"></div>' : '') +
      '</div>';

    var bodyEl = back.querySelector('.body');
    bodyEl.innerHTML = opts.body || '';
    if (opts.actions) {
      var actEl = back.querySelector('.actions');
      actEl.innerHTML = opts.actions.map(function (a, i) {
        return '<button class="btn ' + (a.cls || '') + '" data-i="' + i + '">' + esc(a.label) + '</button>';
      }).join('');
      actEl.addEventListener('click', function (e) {
        var b = e.target.closest('.btn');
        if (!b) return;
        var a = opts.actions[+b.dataset.i];
        if (a.onClick) {
          var keep = a.onClick(bodyEl);
          if (keep !== true) closeSheet();
        } else closeSheet();
      });
    }

    if (opts.onBody) opts.onBody(bodyEl);

    back.addEventListener('click', function (e) {
      if (e.target === back) closeSheet();
    });

    root.appendChild(back);
    sheetStack.push({
      el: back,
      back: opts.onBack,
      close: function () { if (back.parentNode) back.parentNode.removeChild(back); }
    });
    return bodyEl;
  }

  function closeSheet() {
    var s = sheetStack.pop();
    if (!s) return;
    s.close();
    if (s.back) { try { s.back(); } catch (e) { } }
  }
  function closeAllSheets() {
    while (sheetStack.length) closeSheet();
  }
  function hasSheet() { return sheetStack.length > 0; }

  function askText(title, value, placeholder) {
    return new Promise(function (resolve) {
      var done = false;
      var body = openSheet({
        title: title,
        body: '<div class="slider-row"><input id="ask-input" type="text" style="width:100%;padding:12px 14px;border-radius:12px;border:1px solid var(--line);background:var(--surface-2);color:var(--text);outline:none" placeholder="' + esc(placeholder || '') + '" value="' + esc(value || '') + '"></div>',
        actions: [
          { label: 'Cancelar', onClick: function () { done = true; resolve(null); } },
          { label: 'Guardar', cls: 'primary', onClick: function () { done = true; resolve(input.value.trim()); } }
        ]
      });
      var input = body.querySelector('#ask-input');
      setTimeout(function () { input.focus(); input.select(); }, 120);
      input.addEventListener('keydown', function (e) {
        if (e.key === 'Enter') { done = true; resolve(input.value.trim()); closeSheet(); }
      });
      sheetStack[sheetStack.length - 1].back = function () { if (!done) resolve(null); };
    });
  }

  function confirmDialog(title, msg, okLabel, danger) {
    return new Promise(function (resolve) {
      var done = false;
      openSheet({
        title: title,
        body: '<p class="note">' + msg + '</p>',
        actions: [
          { label: 'Cancelar', onClick: function () { done = true; resolve(false); } },
          { label: okLabel || 'Aceptar', cls: danger ? 'danger' : 'primary', onClick: function () { done = true; resolve(true); } }
        ]
      });
      sheetStack[sheetStack.length - 1].back = function () { if (!done) resolve(false); };
    });
  }

  /* ---------------------------------------------------------
     Acciones sobre libros
  --------------------------------------------------------- */
  async function bookMenu(id) {
    var b = state.books.filter(function (x) { return x.id === id; })[0];
    if (!b) return;

    openSheet({
      title: b.title,
      body:
        '<button class="row" data-act="open"><div class="grow"><div class="t">Abrir</div><div class="d">Página ' + (b.lastPage || 1) + ' de ' + b.pages + '</div></div><span class="chev">›</span></button>' +
        '<button class="row" data-act="rename"><div class="grow"><div class="t">Cambiar título</div></div><span class="chev">›</span></button>' +
        '<button class="row" data-act="move"><div class="grow"><div class="t">Mover a carpeta</div><div class="d">' + esc(folderName(b.folder) || 'Sin carpeta') + '</div></div><span class="chev">›</span></button>' +
        '<button class="row" data-act="info"><div class="grow"><div class="t">Detalles</div><div class="d">' + fmtBytes(b.size) + ' · ' + fmtDate(b.added) + '</div></div><span class="chev">›</span></button>' +
        '<div class="sep"></div>' +
        '<button class="row" data-act="delete"><div class="grow"><div class="t" style="color:#c0392b">Eliminar de la biblioteca</div></div></button>',
      onBody: function (body) {
        body.addEventListener('click', async function (e) {
          var row = e.target.closest('.row');
          if (!row) return;
          var act = row.dataset.act;

          if (act === 'open') { closeSheet(); openReader(b); return; }

          if (act === 'rename') {
            closeSheet();
            var name = await askText('Título del libro', b.title);
            if (name) { b.title = name; await dbPut('books', b); renderLibrary(); }
            return;
          }

          if (act === 'move') {
            closeSheet();
            openFolderPicker(b);
            return;
          }

          if (act === 'info') {
            closeSheet();
            openSheet({
              title: 'Detalles',
              body:
                '<div class="row"><div class="grow"><div class="d">Título</div><div class="t">' + esc(b.title) + '</div></div></div>' +
                '<div class="row"><div class="grow"><div class="d">Autor</div><div class="t">' + esc(b.author || '—') + '</div></div></div>' +
                '<div class="row"><div class="grow"><div class="d">Páginas</div><div class="t">' + b.pages + '</div></div></div>' +
                '<div class="row"><div class="grow"><div class="d">Tamaño</div><div class="t">' + fmtBytes(b.size) + '</div></div></div>' +
                '<div class="row"><div class="grow"><div class="d">Agregado</div><div class="t">' + fmtDate(b.added) + '</div></div></div>' +
                '<div class="row"><div class="grow"><div class="d">Carpeta</div><div class="t">' + esc(folderName(b.folder) || 'Sin carpeta') + '</div></div></div>',
              actions: [{ label: 'Cerrar' }]
            });
            return;
          }

          if (act === 'delete') {
            closeSheet();
            var ok = await confirmDialog(
              'Eliminar libro',
              '¿Eliminar <b>' + esc(b.title) + '</b> de la biblioteca? El archivo se borrará de la app.',
              'Eliminar', true
            );
            if (ok) {
              await dbDel('books', b.id);
              await dbDel('files', b.id);
              state.books = state.books.filter(function (x) { return x.id !== b.id; });
              renderLibrary();
              toast('Libro eliminado');
            }
            return;
          }
        });
      }
    });
  }

  function openFolderPicker(b) {
    var body =
      '<button class="row" data-f=""><div class="grow"><div class="t">Sin carpeta</div></div>' +
      (!b.folder ? '<span class="chev">✓</span>' : '') + '</button>';
    state.folders.forEach(function (f) {
      body += '<button class="row" data-f="' + esc(f.id) + '"><div class="grow"><div class="t">' + esc(f.name) + '</div></div>' +
        (b.folder === f.id ? '<span class="chev">✓</span>' : '') + '</button>';
    });

    openSheet({
      title: 'Mover a carpeta',
      body: body,
      onBody: function (el) {
        el.addEventListener('click', async function (e) {
          var row = e.target.closest('.row');
          if (!row) return;
          b.folder = row.dataset.f || null;
          await dbPut('books', b);
          closeSheet();
          renderLibrary();
          toast('Movido a ' + (folderName(b.folder) || 'Sin carpeta'));
        });
      }
    });
  }

  /* ---------------------------------------------------------
     Gestión de carpetas
  --------------------------------------------------------- */
  function openFolders() {
    var body = '';
    if (!state.folders.length) {
      body = '<p class="note">Aún no tienes carpetas. Crea una para organizar tus libros (por ejemplo: Novela, Universidad, Trabajo).</p>';
    } else {
      state.folders.forEach(function (f) {
        var n = state.books.filter(function (b) { return b.folder === f.id; }).length;
        body +=
          '<div class="row"><div class="grow" data-open="' + esc(f.id) + '">' +
            '<div class="t">' + esc(f.name) + '</div><div class="d">' + n + ' libro' + (n === 1 ? '' : 's') + '</div></div>' +
            '<button class="icon-btn" data-rename="' + esc(f.id) + '" title="Renombrar">✎</button>' +
            '<button class="icon-btn" data-del="' + esc(f.id) + '" title="Eliminar" style="color:#c0392b">🗑</button></div>';
      });
    }

    openSheet({
      title: 'Carpetas',
      body: body,
      actions: [
        { label: 'Nueva carpeta', cls: 'primary', onClick: function () { closeSheet(); newFolder(); } }
      ],
      onBody: function (el) {
        el.addEventListener('click', async function (e) {
          var openId = e.target.closest('[data-open]');
          var ren = e.target.closest('[data-rename]');
          var del = e.target.closest('[data-del]');

          if (openId) {
            state.folder = openId.dataset.open;
            closeSheet();
            renderLibrary();
            return;
          }
          if (ren) {
            var f = state.folders.filter(function (x) { return x.id === ren.dataset.rename; })[0];
            closeSheet();
            var name = await askText('Renombrar carpeta', f.name);
            if (name) { f.name = name; await dbPut('folders', f); renderLibrary(); }
            return;
          }
          if (del) {
            var f2 = state.folders.filter(function (x) { return x.id === del.dataset.del; })[0];
            closeSheet();
            var ok = await confirmDialog('Eliminar carpeta',
              '¿Eliminar <b>' + esc(f2.name) + '</b>? Los libros no se borran, solo quedan sin carpeta.',
              'Eliminar', true);
            if (ok) {
              state.books.forEach(function (b) { if (b.folder === f2.id) { b.folder = null; dbPut('books', b); } });
              await dbDel('folders', f2.id);
              state.folders = state.folders.filter(function (x) { return x.id !== f2.id; });
              if (state.folder === f2.id) state.folder = 'all';
              renderLibrary();
            }
          }
        });
      }
    });
  }

  async function newFolder() {
    var name = await askText('Nueva carpeta', '', 'Nombre de la carpeta');
    if (!name) return;
    var f = { id: uid(), name: name.slice(0, 60), created: Date.now() };
    await dbPut('folders', f);
    state.folders.push(f);
    state.folders.sort(function (a, b) { return a.name.localeCompare(b.name); });
    renderFolders();
    toast('Carpeta creada');
  }

  /* ---------------------------------------------------------
     Ajustes
  --------------------------------------------------------- */
  function openSettings() {
    var s = state.settings;

    function seg(name, opts, cur) {
      return '<div class="segmented" data-seg="' + name + '">' + opts.map(function (o) {
        return '<button data-v="' + o.v + '" class="' + (cur === o.v ? 'active' : '') + '">' + o.t + '</button>';
      }).join('') + '</div>';
    }

    openSheet({
      title: 'Ajustes',
      body:
        '<div class="slider-row"><label><span>Tema de la app</span></label>' +
          seg('theme', [{ v: 'light', t: 'Claro' }, { v: 'sepia', t: 'Sepia' }, { v: 'dark', t: 'Oscuro' }], s.theme) +
        '</div>' +
        '<div class="slider-row"><label><span>Color de las páginas</span></label>' +
          seg('pdfMode', [{ v: 'light', t: 'Original' }, { v: 'sepia', t: 'Sepia' }, { v: 'night', t: 'Noche' }], s.pdfMode) +
        '</div>' +
        '<div class="slider-row"><label><span>Brillo de lectura</span><span id="br-val">' + Math.round(s.brightness * 100) + '%</span></label>' +
          '<input type="range" id="set-bright" min="30" max="130" value="' + Math.round(s.brightness * 100) + '"></div>' +
        '<div class="slider-row"><label><span>Velocidad de lectura en voz alta</span><span id="rate-val">' + s.ttsRate.toFixed(1) + 'x</span></label>' +
          '<input type="range" id="set-rate" min="5" max="20" value="' + Math.round(s.ttsRate * 10) + '"></div>' +
        '<div class="sep"></div>' +
        '<div class="row" id="storage-row"><div class="grow"><div class="t">Almacenamiento usado</div><div class="d" id="storage-info">Calculando…</div></div></div>' +
        '<div class="sep"></div>' +
        '<p class="note">Lector PDF 1.0 · Hecho para leer sin distracciones.<br>Los libros se guardan solo en este teléfono.</p>',
      onBody: function (el) {
        el.addEventListener('click', function (e) {
          var b = e.target.closest('.segmented button');
          if (!b) return;
          var segName = b.closest('.segmented').dataset.seg;
          state.settings[segName] = b.dataset.v;
          $$('.segmented button', b.parentNode).forEach(function (x) { x.classList.toggle('active', x === b); });
          saveSettings(); applySettings();
          if (segName === 'pdfMode' && Reader.isOpen) Reader.refreshFilter();
        });
        el.querySelector('#set-bright').addEventListener('input', function (e) {
          state.settings.brightness = +e.target.value / 100;
          el.querySelector('#br-val').textContent = e.target.value + '%';
          saveSettings(); applySettings();
        });
        el.querySelector('#set-rate').addEventListener('input', function (e) {
          state.settings.ttsRate = +e.target.value / 10;
          el.querySelector('#rate-val').textContent = state.settings.ttsRate.toFixed(1) + 'x';
          saveSettings();
        });
        storageInfo(el.querySelector('#storage-info'));
      }
    });
  }

  async function storageInfo(target) {
    try {
      if (navigator.storage && navigator.storage.estimate) {
        var est = await navigator.storage.estimate();
        var used = est.usage || 0;
        var quota = est.quota || 0;
        target.textContent = fmtBytes(used) + ' usados' + (quota ? ' de ' + fmtBytes(quota) + ' disponibles' : '');
        return;
      }
    } catch (e) { }
    var total = state.books.reduce(function (a, b) { return a + (b.size || 0); }, 0);
    target.textContent = fmtBytes(total) + ' en ' + state.books.length + ' libros';
  }

  /* ---------------------------------------------------------
     LECTOR
  --------------------------------------------------------- */
  var Reader = (function () {
    var r = {
      isOpen: false,
      book: null,
      pdf: null,
      numPages: 0,
      zoom: 1,
      scale: 1,
      availW: 0,
      wrappers: [],
      pageAspect: 1.5,
      rendered: {},
      renderPending: false,
      current: 1,
      textCache: {},
      destroyed: false
    };

    var pagesEl, innerEl;

    function init() {
      pagesEl = $('#pages');
      innerEl = $('#pages-inner');
      pagesEl.addEventListener('scroll', onScroll, { passive: true });
      pagesEl.addEventListener('click', onTap, false);
      bindPinch();
    }

    /* ---------- apertura ---------- */
    async function open(book) {
      r.isOpen = true;
      r.book = book;
      r.destroyed = false;
      r.textCache = {};
      r.rendered = {};
      r.current = book.lastPage || 1;
      r.zoom = state.settings.zoom || 1;

      $('#library').classList.remove('active');
      $('#reader').classList.add('active');
      $('#reader-loading').classList.remove('hidden');
      $('#r-name').textContent = book.title;
      $('#r-page').textContent = '';
      $('#pages').classList.remove('chrome-hidden');
      $('#reader').classList.remove('chrome-hidden');
      innerEl.innerHTML = '';
      r.wrappers = [];

      try {
        var rec = await dbGet('files', book.id);
        if (!rec || !rec.blob) throw new Error('Archivo no encontrado');
        var buf = await rec.blob.arrayBuffer();

        r.pdf = await PDFJS.getDocument(Object.assign({ data: new Uint8Array(buf) }, CFG)).promise;
        r.numPages = r.pdf.numPages;

        var p1 = await r.pdf.getPage(1);
        var vp1 = p1.getViewport({ scale: 1 });
        r.pageAspect = vp1.height / vp1.width;

        await buildLayout();
        await goToPage(r.current, false);
        $('#reader-loading').classList.add('hidden');

        book.opened = Date.now();
        dbPut('books', book);
      } catch (e) {
        console.error(e);
        $('#reader-loading').innerHTML = '<div style="padding:24px;text-align:center">No se pudo abrir el libro.<br><br><b>Detalle:</b> ' + esc(e.message || e) + '</div>';
        toast('Error al abrir el libro');
        return;
      }
    }

    function close() {
      if (!r.isOpen) return;
      saveProgress();
      r.isOpen = false;
      r.destroyed = true;
      if (r.pdf) { try { r.pdf.destroy(); } catch (e) { } }
      r.pdf = null;
      TTS.stop();
      innerEl.innerHTML = '';
      r.wrappers = [];
      r.rendered = {};
      $('#reader').classList.remove('active');
      $('#library').classList.add('active');
      renderLibrary();
    }

    /* ---------- layout ---------- */
    async function buildLayout() {
      r.availW = pagesEl.clientWidth;
      innerEl.innerHTML = '';
      var p1 = await r.pdf.getPage(1);
      var vp1 = p1.getViewport({ scale: 1 });
      var fit = r.availW / vp1.width;
      r.scale = fit * r.zoom;

      var h = Math.round(r.availW * r.pageAspect * r.zoom);
      var frag = document.createDocumentFragment();
      r.wrappers = [];

      for (var i = 1; i <= r.numPages; i++) {
        var w = document.createElement('div');
        w.className = 'page-wrap';
        w.dataset.page = i;
        w.style.height = h + 'px';
        w.innerHTML = '<div class="ph">' + i + '</div>';
        frag.appendChild(w);
        r.wrappers.push({ el: w, num: i, rendered: false, canvas: null, textLayer: null, height: h });
      }
      innerEl.appendChild(frag);
      var lead = document.createElement('div');
      lead.style.height = '56px';
      innerEl.insertBefore(lead, innerEl.firstChild);
      innerEl.style.setProperty('--scale-factor', String(r.scale));
      var spacer = document.createElement('div');
      spacer.style.height = '76px';
      innerEl.appendChild(spacer);
      $('#r-slider').max = r.numPages;
      innerEl.style.transform = '';
      updateSlider(r.current);
    }

    function onScroll() {
      if (!r.isOpen) return;
      if (r.renderPending) return;
      r.renderPending = true;
      requestAnimationFrame(function () {
        r.renderPending = false;
        var cur = computeCurrentPage();
        if (cur !== r.current) {
          r.current = cur;
          updateSlider(cur);
          saveProgressThrottled();
        }
        renderVisible();
      });
    }

    function computeCurrentPage() {
      var top = pagesEl.scrollTop + 56;
      var mid = top + pagesEl.clientHeight * 0.3;
      for (var i = 0; i < r.wrappers.length; i++) {
        var w = r.wrappers[i];
        var t = w.el.offsetTop;
        if (t + w.height > mid) return w.num;
      }
      return r.numPages;
    }

    function renderVisible() {
      if (!r.pdf) return;
      var top = pagesEl.scrollTop;
      var bottom = top + pagesEl.clientHeight;
      var buf = pagesEl.clientHeight * 0.9;
      var visible = [];

      for (var i = 0; i < r.wrappers.length; i++) {
        var w = r.wrappers[i];
        var t = w.el.offsetTop;
        if (t + w.height >= top - buf && t <= bottom + buf) visible.push(w);
      }

      // liberar memoria de páginas lejanas
      var keep = {};
      visible.forEach(function (w) { keep[w.num] = true; });
      Object.keys(r.rendered).forEach(function (num) {
        if (!keep[num]) {
          var w = r.wrappers[num - 1];
          if (w && w.rendered) {
            if (w.canvas) { w.canvas.width = 0; w.canvas.height = 0; w.canvas.remove(); }
            if (w.textLayer) w.textLayer.remove();
            w.canvas = null; w.textLayer = null; w.rendered = false;
            w.el.insertAdjacentHTML('afterbegin', '<div class="ph">' + num + '</div>');
          }
          delete r.rendered[num];
        }
      });

      visible.forEach(function (w) {
        if (!w.rendered && !w.rendering) renderPage(w);
      });
    }

    async function renderPage(w) {
      if (w.rendering || w.rendered) return;
      w.rendering = true;
      var doc = r.pdf, num = w.num;
      try {
        var page = await doc.getPage(num);
        if (r.destroyed || !r.isOpen) return;

        var vp = page.getViewport({ scale: r.scale });
        var dpr = Math.min(window.devicePixelRatio || 1, 2);
        var canvas = document.createElement('canvas');
        canvas.width = Math.floor(vp.width * dpr);
        canvas.height = Math.floor(vp.height * dpr);
        var ph = w.el.querySelector('.ph');
        if (ph) ph.remove();

        w.el.style.height = Math.round(vp.height) + 'px';
        w.el.style.width = Math.round(vp.width) + 'px';
        w.height = Math.round(vp.height);
        w.el.appendChild(canvas);

        var ctx = canvas.getContext('2d', { alpha: false });
        ctx.fillStyle = '#fff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        await page.render({
          canvasContext: ctx,
          viewport: vp,
          transform: dpr !== 1 ? [dpr, 0, 0, dpr, 0, 0] : null
        }).promise;

        w.canvas = canvas;
        w.rendered = true;
        r.rendered[num] = true;

        // capa de texto (selección + copiar) — opcional, nunca bloquea
        try { await buildTextLayer(page, vp, w); } catch (e) { }
      } catch (e) {
        console.warn('render', num, e);
      } finally {
        w.rendering = false;
      }
    }

    async function buildTextLayer(page, vp, w) {
      if (!PDFJS.renderTextLayer) return;
      var tc = await page.getTextContent();
      var layer = document.createElement('div');
      layer.className = 'textLayer';
      layer.style.width = Math.round(vp.width) + 'px';
      layer.style.height = Math.round(vp.height) + 'px';
      w.el.appendChild(layer);
      try {
        await PDFJS.renderTextLayer({
          textContent: tc,
          container: layer,
          viewport: vp,
          textDivs: [],
          enhanceTextSelection: false,
          isOffscreenCanvasSupported: false
        }).promise;
        w.textLayer = layer;
      } catch (e) {
        layer.remove();
      }
    }

    /* ---------- navegación ---------- */
    async function goToPage(num, smooth) {
      num = clamp(Math.round(num) || 1, 1, r.numPages);
      var w = r.wrappers[num - 1];
      if (!w) return;
      var top = Math.max(0, w.el.offsetTop - 56);
      if (typeof pagesEl.scrollTo === 'function') {
        pagesEl.scrollTo({ top: top, behavior: smooth ? 'smooth' : 'auto' });
      } else {
        pagesEl.scrollTop = top;
      }
      r.current = num;
      updateSlider(num);
      renderVisible();
      saveProgressThrottled();
    }

    function updateSlider(num) {
      var s = $('#r-slider');
      s.max = r.numPages || 1;
      s.value = num;
      $('#r-page-label').textContent = num + ' / ' + r.numPages;
      $('#r-page').textContent = 'Página ' + num + ' de ' + r.numPages +
        (r.book ? ' · ' + Math.round((num / r.numPages) * 100) + '%' : '');
    }

    var saveT = null;
    function saveProgressThrottled() {
      clearTimeout(saveT);
      saveT = setTimeout(saveProgress, 1200);
    }
    function saveProgress() {
      if (!r.book || !r.numPages) return;
      r.book.lastPage = r.current;
      r.book.opened = Date.now();
      dbPut('books', r.book);
    }

    /* ---------- toque: mostrar/ocultar barras ---------- */
    var tapTimer = null, tapStart = null;
    function onTap(e) {
      if (e.target.closest('.textLayer') && window.getSelection && String(window.getSelection()).length) return;
      if (tapStart) {
        var dx = Math.abs(e.clientX - tapStart.x), dy = Math.abs(e.clientY - tapStart.y);
        if (dx > 12 || dy > 12) return;
      }
      clearTimeout(tapTimer);
      tapTimer = setTimeout(function () {
        $('#reader').classList.toggle('chrome-hidden');
      }, 120);
    }
    function markStart(e) {
      if (e.touches && e.touches.length === 1) {
        tapStart = { x: e.touches[0].clientX, y: e.touches[0].clientY };
      }
    }

    /* ---------- pinch zoom ---------- */
    function bindPinch() {
      var startDist = 0, startZoom = 1, startScale = 1, active = false, lastRatio = 1;

      pagesEl.addEventListener('touchstart', function (e) {
        markStart(e);
        if (e.touches.length === 2) {
          active = true;
          startZoom = r.zoom;
          startScale = r.scale;
          lastRatio = 1;
          startDist = dist(e.touches[0], e.touches[1]);
          innerEl.style.transformOrigin = '0 0';
        }
      }, { passive: true });

      pagesEl.addEventListener('touchmove', function (e) {
        if (!active || e.touches.length !== 2) return;
        var d = dist(e.touches[0], e.touches[1]);
        if (!startDist) return;
        var ratio = d / startDist;
        lastRatio = ratio;
        var z = clamp(startZoom * ratio, 0.6, 4) / startZoom;
        innerEl.style.transform = 'scale(' + z + ')';
        e.preventDefault();
      }, { passive: false });

      pagesEl.addEventListener('touchend', function (e) {
        if (!active) return;
        if (e.touches.length === 0) {
          active = false;
          var z = clamp(startZoom * lastRatio, 0.6, 4);
          innerEl.style.transform = '';
          if (Math.abs(z - r.zoom) > 0.03) {
            r.zoom = z;
            state.settings.zoom = z;
            saveSettings();
            relayout();
          }
        }
      }, { passive: true });
    }

    function dist(a, b) {
      var dx = a.clientX - b.clientX, dy = a.clientY - b.clientY;
      return Math.sqrt(dx * dx + dy * dy);
    }

    async function relayout() {
      var page = r.current;
      var w = r.wrappers[page - 1];
      var rel = w ? (pagesEl.scrollTop - w.el.offsetTop) / Math.max(1, w.height) : 0;

      await buildLayout();
      var nw = r.wrappers[page - 1];
      if (nw) pagesEl.scrollTop = nw.el.offsetTop + rel * nw.height;
      renderVisible();
      updateSlider(page);
    }

    function setZoom(z) {
      r.zoom = clamp(z, 0.6, 4);
      state.settings.zoom = r.zoom;
      saveSettings();
      relayout();
    }

    /* ---------- índice / TOC ---------- */
    async function chapters() {
      var out = [];
      if (!r.pdf) return out;
      var toc = [];
      try { toc = await r.pdf.getOutline(); } catch (e) { }
      if (!toc || !toc.length) return out;

      async function walk(items, depth) {
        for (var i = 0; i < items.length; i++) {
          var it = items[i];
          if (depth > 3) continue;
          var pg = null;
          try { pg = await destToPage(it.dest); } catch (e) { }
          out.push({ title: it.title || '(sin título)', page: pg, depth: depth });
          if (it.items && it.items.length) await walk(it.items, depth + 1);
        }
      }
      await walk(toc, 0);
      return out;
    }

    async function destToPage(dest) {
      if (!dest) return null;
      var d = dest;
      if (typeof d === 'string') d = await r.pdf.getDestination(d);
      if (!Array.isArray(d) || !d.length) return null;
      var ref = d[0];
      if (typeof ref === 'number') return ref + 1;
      try { return (await r.pdf.getPageIndex(ref)) + 1; } catch (e) { return null; }
    }

    /* ---------- texto ---------- */
    async function pageText(num) {
      if (r.textCache[num]) return r.textCache[num];
      var page = await r.pdf.getPage(num);
      var tc = await page.getTextContent();
      var out = '';
      for (var i = 0; i < tc.items.length; i++) {
        var it = tc.items[i];
        if (!it.str) continue;
        out += it.str;
        if (it.hasEOL) out += '\n';
        else if (!/\s$/.test(it.str)) out += ' ';
      }
      out = out.replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
      r.textCache[num] = out;
      return out;
    }

    /* ---------- búsqueda ---------- */
    async function search(query, onProgress) {
      var q = query.trim();
      if (q.length < 2) return [];
      var norm = function (s) {
        return s.toLowerCase().normalize ? s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '') : s.toLowerCase();
      };
      var nq = norm(q);
      var results = [];

      for (var i = 1; i <= r.numPages; i++) {
        if (r.destroyed) break;
        var text = '';
        try { text = await pageText(i); } catch (e) { continue; }
        var nt = norm(text);
        var idx = nt.indexOf(nq);
        if (idx >= 0) {
          var count = 0, from = 0, k;
          while ((k = nt.indexOf(nq, from)) >= 0) { count++; from = k + nq.length; }
          var start = Math.max(0, idx - 45);
          results.push({
            page: i,
            count: count,
            snippet: (start > 0 ? '…' : '') + text.substr(start, 130).replace(/\s+/g, ' ') + '…'
          });
        }
        if (onProgress && (i % 12 === 0)) onProgress(i / r.numPages);
        if (results.length >= 300) break;
      }
      return results;
    }

    return {
      get isOpen() { return r.isOpen; },
      init: init,
      open: open,
      close: close,
      goToPage: goToPage,
      next: function () { goToPage(r.current + 1, true); },
      prev: function () { goToPage(r.current - 1, true); },
      slider: function (v) { goToPage(+v, false); },
      setZoom: setZoom,
      chapters: chapters,
      search: search,
      pageText: pageText,
      get current() { return r.current; },
      get numPages() { return r.numPages; },
      get zoom() { return r.zoom; },
      refreshFilter: function () { },
      saveProgress: saveProgress
    };
  })();

  /* ---------------------------------------------------------
     Lectura en voz alta (TTS)
  --------------------------------------------------------- */
  var TTS = (function () {
    var playing = false, cancelled = false, curPage = 1, bar = null;

    function plugin() {
      return (window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.TextToSpeech) || null;
    }

    function webSpeak(text) {
      return new Promise(function (resolve) {
        if (!window.speechSynthesis) return resolve();
        var u = new SpeechSynthesisUtterance(text);
        u.lang = state.settings.ttsLang;
        u.rate = state.settings.ttsRate;
        u.onend = resolve;
        u.onerror = resolve;
        window.speechSynthesis.speak(u);
      });
    }

    async function speak(text) {
      var p = plugin();
      if (p) {
        await p.speak({
          text: text,
          lang: state.settings.ttsLang,
          rate: state.settings.ttsRate,
          pitch: 1.0,
          volume: 1.0,
          category: 'playback'
        });
      } else {
        await webSpeak(text);
      }
    }

    function chunk(text, max) {
      var parts = [], cur = '';
      var words = text.split(/\s+/);
      for (var i = 0; i < words.length; i++) {
        var w = words[i];
        if (!w) continue;
        if (cur && (cur.length + 1 + w.length) > max) { parts.push(cur); cur = w; }
        else cur = cur ? cur + ' ' + w : w;
      }
      if (cur) parts.push(cur);
      return parts.filter(function (x) { return x.trim().length > 0; });
    }

    function ui(show, page) {
      if (bar) { bar.remove(); bar = null; }
      if (!show) return;
      bar = document.createElement('div');
      bar.className = 'tts-bar';
      bar.innerHTML =
        '<div class="tts-info"><b>Leyendo en voz alta</b><small id="tts-sub">Página ' + page + '</small></div>' +
        '<button id="tts-stop" title="Detener">■</button>';
      $('#reader').appendChild(bar);
      bar.querySelector('#tts-stop').addEventListener('click', function () { stop(); toast('Lectura detenida'); });
    }

    async function play(fromPage) {
      if (playing) { stop(); return; }
      var start = fromPage || Reader.current;
      playing = true; cancelled = false; curPage = start;
      ui(true, curPage);

      while (!cancelled && curPage <= Reader.numPages) {
        var text = '';
        try { text = await Reader.pageText(curPage); } catch (e) { }
        if (cancelled) break;

        if (text && text.length > 2) {
          var parts = chunk(text, 2800);
          for (var i = 0; i < parts.length && !cancelled; i++) {
            if (bar) bar.querySelector('#tts-sub').textContent = 'Página ' + curPage + ' · parte ' + (i + 1) + '/' + parts.length;
            try { await speak(parts[i]); } catch (e) { console.warn(e); }
          }
        }

        if (cancelled) break;
        curPage++;
        if (curPage <= Reader.numPages) {
          Reader.goToPage(curPage, false);
          if (bar) bar.querySelector('#tts-sub').textContent = 'Página ' + curPage;
        }
      }
      stop();
    }

    function stop() {
      cancelled = true;
      playing = false;
      var p = plugin();
      if (p) { try { p.stop(); } catch (e) { } }
      if (window.speechSynthesis) { try { window.speechSynthesis.cancel(); } catch (e) { } }
      ui(false);
    }

    return { play: play, stop: stop, get playing() { return playing; } };
  })();

  /* ---------------------------------------------------------
     Hojas del lector
  --------------------------------------------------------- */
  async function openTOC() {
    var els = await Reader.chapters();
    if (!els.length) {
      openSheet({
        title: 'Índice',
        body: '<p class="note">Este PDF no tiene un índice (marcadores) incorporado. Usa el control deslizante de abajo para moverte por el libro.</p>',
        actions: [{ label: 'Cerrar' }]
      });
      return;
    }
    var body = els.map(function (c, i) {
      return '<button class="toc-item" data-page="' + (c.page || '') + '" style="padding-left:' + (14 + c.depth * 16) + 'px">' +
        (c.page ? '<span class="p">' + c.page + '</span>' : '') + esc(c.title) + '</button>';
    }).join('');

    openSheet({
      title: 'Índice',
      body: body,
      onBody: function (el) {
        el.addEventListener('click', function (e) {
          var b = e.target.closest('.toc-item');
          if (!b || !b.dataset.page) return;
          closeSheet();
          Reader.goToPage(+b.dataset.page, true);
        });
      }
    });
  }

  function openSearch() {
    openSheet({
      title: 'Buscar en el libro',
      body:
        '<div style="display:flex;gap:8px;padding:0 4px 8px">' +
          '<input id="pdf-q" type="search" placeholder="Escribe una palabra o frase" style="flex:1;padding:11px 13px;border-radius:12px;border:1px solid var(--line);background:var(--surface-2);color:var(--text);outline:none">' +
        '</div>' +
        '<div id="pdf-results" class="note">Escribe al menos 2 letras.</div>',
      onBody: function (el) {
        var input = el.querySelector('#pdf-q');
        var out = el.querySelector('#pdf-results');
        var timer = null;

        out.addEventListener('click', function (e) {
          var b = e.target.closest('[data-page]');
          if (!b) return;
          closeSheet();
          Reader.goToPage(+b.dataset.page, true);
        });

        async function run() {
          var q = input.value;
          if (q.trim().length < 2) { out.textContent = 'Escribe al menos 2 letras.'; return; }
          out.innerHTML = '<div style="display:flex;align-items:center;gap:10px"><div class="spinner" style="width:18px;height:18px;border-width:2px"></div> Buscando…</div>';
          var res = await Reader.search(q, function (p) {
            out.innerHTML = 'Buscando… ' + Math.round(p * 100) + '%';
          });
          if (!res.length) { out.textContent = 'Sin coincidencias para “' + q + '”.'; return; }
          var total = res.reduce(function (a, x) { return a + x.count; }, 0);
          out.innerHTML = '<div style="padding:0 4px 8px">' + total + ' coincidencia' + (total === 1 ? '' : 's') + ' en ' + res.length + ' página' + (res.length === 1 ? '' : 's') + '</div>' +
            res.map(function (r) {
              return '<button class="row" data-page="' + r.page + '" style="flex-direction:column;align-items:flex-start;gap:2px;width:100%;text-align:left">' +
                '<div class="t" style="font-size:13px">Página ' + r.page + ' <span style="color:var(--text-dim)">(' + r.count + ')</span></div>' +
                '<div class="d" style="font-size:12px;line-height:1.4">' + esc(r.snippet) + '</div></button>';
            }).join('');
        }

        input.addEventListener('input', function () {
          clearTimeout(timer);
          timer = setTimeout(run, 450);
        });
        input.addEventListener('keydown', function (e) { if (e.key === 'Enter') { clearTimeout(timer); run(); } });
        setTimeout(function () { input.focus(); }, 150);
      }
    });
  }

  function openReaderMenu() {
    openSheet({
      title: 'Lectura',
      body:
        '<button class="row" data-act="tts"><div class="grow"><div class="t">Leer en voz alta</div><div class="d">Desde la página actual</div></div><span class="chev">🔊</span></button>' +
        '<button class="row" data-act="theme"><div class="grow"><div class="t">Color de páginas</div><div class="d" id="m-theme">' +
          ({ light: 'Original', sepia: 'Sepia', night: 'Modo noche' }[state.settings.pdfMode]) + '</div></div><span class="chev">›</span></button>' +
        '<button class="row" data-act="bright"><div class="grow"><div class="t">Brillo</div></div><span class="chev">›</span></button>' +
        '<button class="row" data-act="zoomin"><div class="grow"><div class="t">Acercar</div><div class="d" id="m-zoom">' + Math.round(Reader.zoom * 100) + '%</div></div><span class="chev">+</span></button>' +
        '<button class="row" data-act="zoomout"><div class="grow"><div class="t">Alejar</div></div><span class="chev">−</span></button>' +
        '<button class="row" data-act="zoomreset"><div class="grow"><div class="t">Ajustar a la pantalla</div></div><span class="chev">⤢</span></button>' +
        '<div class="sep"></div>' +
        '<button class="row" data-act="settings"><div class="grow"><div class="t">Ajustes generales</div></div><span class="chev">›</span></button>',
      onBody: function (el) {
        el.addEventListener('click', function (e) {
          var b = e.target.closest('.row');
          if (!b) return;
          var act = b.dataset.act;
          if (act === 'tts') { closeSheet(); TTS.play(); }
          else if (act === 'theme') {
            var order = ['light', 'sepia', 'night'];
            var i = order.indexOf(state.settings.pdfMode);
            state.settings.pdfMode = order[(i + 1) % 3];
            saveSettings(); applySettings();
            el.querySelector('#m-theme').textContent = { light: 'Original', sepia: 'Sepia', night: 'Modo noche' }[state.settings.pdfMode];
          }
          else if (act === 'bright') { closeSheet(); openBrightness(); }
          else if (act === 'zoomin') { Reader.setZoom(Reader.zoom + 0.25); el.querySelector('#m-zoom').textContent = Math.round(Reader.zoom * 100) + '%'; }
          else if (act === 'zoomout') { Reader.setZoom(Reader.zoom - 0.25); el.querySelector('#m-zoom').textContent = Math.round(Reader.zoom * 100) + '%'; }
          else if (act === 'zoomreset') { Reader.setZoom(1); el.querySelector('#m-zoom').textContent = '100%'; }
          else if (act === 'settings') { closeSheet(); openSettings(); }
        });
      }
    });
  }

  function openBrightness() {
    openSheet({
      title: 'Brillo',
      body: '<div class="slider-row"><label><span>Brillo</span><span id="b2-val">' + Math.round(state.settings.brightness * 100) + '%</span></label>' +
        '<input type="range" id="b2" min="30" max="130" value="' + Math.round(state.settings.brightness * 100) + '"></div>',
      onBody: function (el) {
        var inp = el.querySelector('#b2');
        inp.addEventListener('input', function () {
          state.settings.brightness = +inp.value / 100;
          el.querySelector('#b2-val').textContent = inp.value + '%';
          saveSettings(); applySettings();
        });
      },
      actions: [{ label: 'Listo', cls: 'primary' }]
    });
  }

  /* ---------------------------------------------------------
     Navegación global / eventos
  --------------------------------------------------------- */
  function bindUI() {
    // biblioteca
    $('#fab').addEventListener('click', function () { $('#file-input').click(); });
    $('#file-input').addEventListener('change', function (e) {
      importFiles(e.target.files);
      e.target.value = '';
    });

    $('#btn-search').addEventListener('click', function () {
      var w = $('#search-wrap');
      var on = w.classList.toggle('hidden') === false;
      if (on) { $('#search-input').focus(); }
      else { state.query = ''; $('#search-input').value = ''; renderLibrary(); }
    });
    $('#search-input').addEventListener('input', function (e) {
      state.query = e.target.value;
      renderLibrary();
    });

    $('#btn-folders').addEventListener('click', openFolders);
    $('#btn-settings').addEventListener('click', openSettings);

    $('#folder-chips').addEventListener('click', function (e) {
      var c = e.target.closest('.chip');
      if (!c) return;
      state.folder = c.dataset.folder;
      renderLibrary();
      e.target.scrollIntoView({ inline: 'center', block: 'nearest', behavior: 'smooth' });
    });

    // tarjetas: toque = abrir, mantener = menú
    var pressTimer = null, longPressed = false, startPt = null;
    var grid = $('#book-grid');

    function cardFrom(e) {
      var el = e.target.closest ? e.target.closest('.book-card') : null;
      return el;
    }

    grid.addEventListener('touchstart', function (e) {
      var card = cardFrom(e);
      if (!card) return;
      longPressed = false;
      startPt = { x: e.touches[0].clientX, y: e.touches[0].clientY };
      pressTimer = setTimeout(function () {
        longPressed = true;
        if (navigator.vibrate) navigator.vibrate(12);
        bookMenu(card.dataset.id);
      }, 480);
    }, { passive: true });

    grid.addEventListener('touchmove', function (e) {
      if (!startPt) return;
      var t = e.touches[0];
      if (Math.abs(t.clientX - startPt.x) > 10 || Math.abs(t.clientY - startPt.y) > 10) {
        clearTimeout(pressTimer);
      }
    }, { passive: true });

    grid.addEventListener('touchend', function () {
      clearTimeout(pressTimer);
    }, { passive: true });

    grid.addEventListener('click', function (e) {
      var card = cardFrom(e);
      if (!card) return;
      if (longPressed) { longPressed = false; return; }
      var b = state.books.filter(function (x) { return x.id === card.dataset.id; })[0];
      if (b) Reader.open(b);
    });

    // lector
    $('#r-back').addEventListener('click', function () { Reader.close(); });
    $('#r-prev').addEventListener('click', function () { Reader.prev(); });
    $('#r-next').addEventListener('click', function () { Reader.next(); });
    $('#r-slider').addEventListener('input', function (e) { Reader.slider(e.target.value); });
    $('#r-toc').addEventListener('click', openTOC);
    $('#r-search').addEventListener('click', openSearch);
    $('#r-more').addEventListener('click', openReaderMenu);
    $('#r-tts').addEventListener('click', function () { TTS.play(); });

    // atajos de teclado (útil al probar en escritorio)
    document.addEventListener('keydown', function (e) {
      if (hasSheet()) return;
      if (!Reader.isOpen) return;
      if (e.key === 'ArrowRight') Reader.next();
      if (e.key === 'ArrowLeft') Reader.prev();
      if (e.key === 'Escape') Reader.close();
    });

    // botón atrás del celular
    if (window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.App) {
      window.Capacitor.Plugins.App.addListener('backButton', function () {
        if (hasSheet()) { closeSheet(); return; }
        if (Reader.isOpen) { Reader.close(); return; }
        window.Capacitor.Plugins.App.minimizeApp();
      });
    }
  }

  /* ---------------------------------------------------------
     Arranque
  --------------------------------------------------------- */
  var booted = false;
  async function boot() {
    if (booted) return;
    booted = true;
    loadSettings();
    Reader.init();
    bindUI();

    try {
      await openDB();
    } catch (e) {
      toast('No se pudo abrir el almacenamiento');
      return;
    }

    try {
      if (navigator.storage && navigator.storage.persist) await navigator.storage.persist();
    } catch (e) { }

    var results = await Promise.all([dbAll('books'), dbAll('folders')]);
    state.books = results[0] || [];
    state.folders = (results[1] || []).sort(function (a, b) { return a.name.localeCompare(b.name); });

    renderLibrary();

    // primera vez: abrir el selector automáticamente produce confusión; solo mostramos el estado vacío
  }

  document.addEventListener('deviceready', boot, false);
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () { setTimeout(boot, 0); });
  } else {
    setTimeout(boot, 0);
  }

  // Guardar progreso al salir
  window.addEventListener('pagehide', function () { Reader.saveProgress(); });
  window.addEventListener('beforeunload', function () { if (Reader.isOpen) Reader.saveProgress(); });

  // evita zoom del navegador con doble toque
  var lastTouch = 0;
  document.addEventListener('touchend', function (e) {
    var now = Date.now();
    if (now - lastTouch <= 300) e.preventDefault();
    lastTouch = now;
  }, false);
})();
