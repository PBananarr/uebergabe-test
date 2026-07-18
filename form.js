(function () {
  // ---------- Globals / Refs ----------
  const sections = Array.isArray(window.form_sections) ? window.form_sections : [];
  const root = document.getElementById('sections-root');
  const form = document.getElementById('uebergabe-form');
  const out = document.getElementById('submitted');

  // ---------- Utils ----------
  const el = (tag, cls) => {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    return n;
  };

  // simple uid counter for input IDs
  let __uid = 0;
  const uid = (prefix = 'f') => `${prefix}_${(++__uid).toString(36)}`;

  // Strukturänderungen (Zeile hinzugefügt/entfernt, Reset) an records.js melden -> Autosave
  const notifyChanged = () => document.dispatchEvent(new CustomEvent('abnahme:changed'));

  // Neue Zeile in Sicht bringen und erstes Feld fokussieren (öffnet die iPad-Tastatur)
  const focusFirstField = (rowEl) => {
    const first = rowEl.querySelector('input:not([type="checkbox"]), textarea, select');
    try { rowEl.scrollIntoView({ block: 'center', behavior: 'smooth' }); } catch (e) { }
    if (first) first.focus({ preventScroll: true });
  };

  // Zeile entfernen; enthält sie bereits Eingaben, vorher rückfragen (Fehlertoleranz).
  // Checkboxen/Selects zählen nicht als Eingabe (haben immer einen Standardwert).
  const confirmRemove = (rowEl) => {
    const hasContent = [...rowEl.querySelectorAll('input, textarea')].some(inp =>
      inp.type !== 'checkbox' && inp.value.trim() !== '');
    if (hasContent && !confirm('Diese Zeile enthält bereits Eingaben. Wirklich entfernen?')) return;
    rowEl.remove();
    notifyChanged();
  };

  // Datum ist praktisch immer "heute": leeres Datumsfeld vorbelegen (änderbar)
  const ensureDefaultDatum = () => {
    const inp = form.querySelector('input[name="datum"]');
    if (inp && !inp.value) {
      const d = new Date();
      inp.value = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    }
  };

  // Return-Taste springt zum nächsten Feld (in Textareas bleibt Enter = Zeilenumbruch)
  form.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter') return;
    const t = e.target;
    if (!t || t.tagName !== 'INPUT' || t.type === 'checkbox') return;
    e.preventDefault();
    const fields = [...form.querySelectorAll('input, select, textarea')]
      .filter(x => !x.disabled && x.type !== 'checkbox' && x.offsetParent !== null);
    const next = fields[fields.indexOf(t) + 1];
    if (next) next.focus();
    else t.blur();
  });

  // iPad-/Tastatur-Hilfen + dezimale Eingaben
  const applyInputHints = (input, name, type) => {
    const nm = String(name || '').toLowerCase();

    // Return-Taste zeigt auf der iPad-Tastatur "Weiter" (springt zum nächsten Feld)
    if (input.tagName === 'INPUT') input.enterKeyHint = 'next';

    const isDecimal =
      /betrag|summe|rate|eur|stand/.test(nm) ||             // generisch: *betrag, *summe, *rate, *eur, *stand
      /_stand$/.test(nm);                                   // z.B. warmwasser_stand, strom_stand

    // Felder, die rein ganzzahlig sind (Zählwerte, IDs)
    const isInteger =
      /^anzahl_/.test(nm) ||                                // z.B. anzahl_hausschluessel
      /(_nr$|_nummer$)/.test(nm);                           // z.B. hausschluessel_nummer

    if (isDecimal) {
      if (input.tagName === 'INPUT' && input.type === 'number') input.type = 'text';
      input.inputMode = 'decimal';       // iOS zeigt , an; . lässt sich trotzdem eingeben
      input.autocomplete = 'off';
      return;
    }

    // 2) Integerfelder: echte numerische Tastatur + pattern für reine Ziffern
    if (type === 'number' || isInteger) {
      input.inputMode = 'numeric';
      input.pattern = '\\d*';
      input.autocomplete = 'off';
      return;
    }
  };

  const addLabelInput = (wrap, label, name, type = 'text', preset, options) => {
    const row = el('div', 'form-group');
    row.setAttribute('role', 'group');
    const id = uid(name || 'field');

    const l = el('label');
    l.textContent = label;
    l.htmlFor = id;
    row.appendChild(l);

    let input;
    if (type === 'textarea') {
      input = document.createElement('textarea');
    } else if (type === 'checkbox') {
      input = document.createElement('input');
      input.type = 'checkbox';
      if (preset === true) input.checked = true;
      input.style.width = 'auto';
      input.setAttribute('aria-label', label);
    } else if (type === 'select') {
      input = document.createElement('select');
      (options || []).forEach(opt => {
        const o = document.createElement('option');
        // unterstützt ["A","B"] und [{ value, label }]
        o.value = String(opt?.value ?? opt);
        o.textContent = String(opt?.label ?? opt);
        input.appendChild(o);
      });
    } else {
      input = document.createElement('input');
      input.type = type || 'text';
    }

    input.name = name;
    input.id = id;
    applyInputHints(input, name, type);

    row.appendChild(input);
    wrap.appendChild(row);
    return input;
  };

  const makeAddFieldUI = (section, idx) => {
    if (!section.options) return null;

    const wrap = el('div', 'field-selector');
    const sel = document.createElement('select');
    sel.id = `select-${idx}`;
    sel.dataset.sectionTitle = section.title || '';
    sel.setAttribute('aria-label', `Option zu "${section.title}" auswählen`);

    const def = document.createElement('option');
    def.value = '';
    def.textContent = '-- Feld auswählen --';
    sel.appendChild(def);

    section.options.forEach(o => {
      const opt = document.createElement('option');
      opt.value = o.name;
      opt.textContent = o.label;
      opt.dataset.type = o.type || 'text';
      if (o.subfields) opt.dataset.subfields = JSON.stringify(o.subfields);
      if (o.fields) opt.dataset.fields = JSON.stringify(o.fields);
      sel.appendChild(opt);
    });

    const addBtn = el('button', 'add-btn');
    addBtn.type = 'button';
    addBtn.textContent = '+';
    addBtn.setAttribute('aria-label', 'Feld hinzufügen');
    addBtn.dataset.section = String(idx);

    const bulkBtn = el('button', 'bulk-btn');
    bulkBtn.type = 'button';
    bulkBtn.textContent = 'Mehrere hinzufügen';
    bulkBtn.title = 'Mehrere Einträge auf einmal per Checkliste hinzufügen';

    wrap.appendChild(sel);
    wrap.appendChild(addBtn);
    wrap.appendChild(bulkBtn);

    return { ui: wrap, select: sel, addBtn, bulkBtn };
  };

  const makeRemoveBtn = (onRemove) => {
    const rm = el('button', 'remove-btn');
    rm.type = 'button';
    rm.textContent = 'Entfernen';
    rm.setAttribute('aria-label', 'Feld entfernen');
    rm.addEventListener('click', () => onRemove?.());
    return rm;
  };

  // ---------- Dynamische Zeile erzeugen (Klick auf "+" ODER Wiederherstellung) ----------
  // Jede erzeugte Zeile bekommt data-option, damit sie beim Zwischenspeichern
  // erkannt und beim Laden identisch wieder aufgebaut werden kann.
  const buildDynamicRow = (sectionIdx, optionName) => {
    const section = sections[sectionIdx];
    const container = document.getElementById(`fields-container-${sectionIdx}`);
    if (!section || !container || !Array.isArray(section.options)) return null;

    const opt = section.options.find(o => o.name === optionName);
    if (!opt) return null;

    const label = opt.label || optionName;

    // --- Spezial: Weitere Räume ---
    if ((section.title || '').trim() === 'Weitere Räume') {
      const card = el('div', 'field-item');
      card.dataset.option = optionName;
      card.style.flexDirection = 'column';
      card.style.alignItems = 'stretch';
      card.setAttribute('role', 'group');

      const head = el('div');
      head.style.display = 'flex';
      head.style.alignItems = 'center';
      head.style.gap = '10px';

      const strong = document.createElement('strong');
      strong.textContent = label;
      strong.id = uid('lbl');
      head.appendChild(strong);

      head.appendChild(makeRemoveBtn(() => confirmRemove(card)));
      card.appendChild(head);

      (opt.fields || opt.subfields || []).forEach(f => {
        addLabelInput(card, f.label, f.name, f.type, f.checked, f.options);
      });

      container.appendChild(card);
      return card;
    }

    // --- Standard: Gruppe mit Subfeldern ---
    if (opt.type === 'multi' && Array.isArray(opt.subfields) && opt.subfields.length) {
      const group = el('div', 'field-item');
      group.dataset.option = optionName;
      group.setAttribute('role', 'group');

      const strong = document.createElement('strong');
      strong.textContent = label;
      strong.id = uid('lbl');
      group.appendChild(strong);

      opt.subfields.forEach(sf => {
        const lab = document.createElement('label');
        const id = uid(sf.name || 'sf');
        lab.textContent = sf.label;
        lab.htmlFor = id;
        group.appendChild(lab);

        let input;
        if (sf.type === 'checkbox') {
          input = document.createElement('input');
          input.type = 'checkbox';
          if (sf.checked) input.checked = true;
          input.style.width = 'auto';
          input.setAttribute('aria-label', sf.label);
        } else if (sf.type === 'textarea') {
          input = document.createElement('textarea');
        } else if (sf.type === 'select') {
          input = document.createElement('select');
          (sf.options || []).forEach(o2 => {
            const o = document.createElement('option');
            o.value = String(o2?.value ?? o2);
            o.textContent = String(o2?.label ?? o2);
            input.appendChild(o);
          });
        } else {
          input = document.createElement('input');
          input.type = sf.type || 'text';
        }
        input.name = sf.name;
        input.id = id;
        applyInputHints(input, sf.name, sf.type);
        group.appendChild(input);
      });

      group.appendChild(makeRemoveBtn(() => confirmRemove(group)));
      container.appendChild(group);
      return group;
    }

    // --- Einzel-Feld ---
    const row = el('div', 'field-item');
    row.dataset.option = optionName;
    row.setAttribute('role', 'group');

    const lab = document.createElement('label');
    const id = uid(opt.name);
    lab.textContent = label;
    lab.htmlFor = id;
    row.appendChild(lab);

    const input = document.createElement('input');
    input.name = opt.name;
    input.type = opt.type || 'text';
    input.id = id;
    applyInputHints(input, input.name, input.type);
    row.appendChild(input);

    row.appendChild(makeRemoveBtn(() => confirmRemove(row)));
    container.appendChild(row);
    return row;
  };

  // ---------- Sammel-Hinzufügen: mehrere Zeilen auf einmal per Checkliste ----------
  let bulkOverlay = null;
  const openBulkDialog = (sectionIdx) => {
    const section = sections[sectionIdx];
    if (!section || !Array.isArray(section.options)) return;

    if (bulkOverlay) bulkOverlay.remove();
    bulkOverlay = el('div', 'sig-overlay no-print');

    const dialog = el('div', 'sig-dialog');

    const h2 = document.createElement('h2');
    h2.textContent = section.title || 'Mehrere hinzufügen';
    dialog.appendChild(h2);

    const hint = el('p', 'sig-hint');
    hint.textContent = 'Gewünschte Einträge ankreuzen – alle werden gemeinsam als leere Zeilen hinzugefügt.';
    dialog.appendChild(hint);

    const list = el('div', 'bulk-list');
    section.options.forEach(opt => {
      const lab = document.createElement('label');
      const cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.value = opt.name;
      lab.appendChild(cb);
      lab.appendChild(document.createTextNode(' ' + opt.label));
      list.appendChild(lab);
    });
    dialog.appendChild(list);

    const close = () => { bulkOverlay?.remove(); bulkOverlay = null; };

    const actions = el('div', 'sig-actions');
    const cancel = document.createElement('button');
    cancel.type = 'button';
    cancel.textContent = 'Abbrechen';
    cancel.addEventListener('click', close);

    const ok = el('button', 'submit-btn');
    ok.type = 'button';
    ok.textContent = 'Hinzufügen';
    ok.addEventListener('click', () => {
      const chosen = [...list.querySelectorAll('input:checked')].map(c => c.value);
      close();
      if (!chosen.length) return;
      let firstRow = null;
      chosen.forEach(name => {
        const r = buildDynamicRow(sectionIdx, name);
        if (r && !firstRow) firstRow = r;
      });
      notifyChanged();
      if (firstRow) focusFirstField(firstRow);
    });

    actions.appendChild(cancel);
    actions.appendChild(ok);
    dialog.appendChild(actions);

    bulkOverlay.appendChild(dialog);
    document.body.appendChild(bulkOverlay);
  };

  // ---------- Rendering ----------
  sections.forEach((section, i) => {
    const h2 = document.createElement('h2');
    h2.textContent = section.title || '';
    root.appendChild(h2);

    // Feste Felder
    if (Array.isArray(section.fields)) {
      section.fields.forEach(f =>
        addLabelInput(root, f.label, f.name, f.type, f.checked, f.options)
      );
    }

    // Dynamische Optionen
    if (Array.isArray(section.options) && section.options.length) {
      const controls = makeAddFieldUI(section, i) || {};
      const { ui, select, addBtn, bulkBtn } = controls;
      const container = el('div');
      container.id = `fields-container-${i}`;

      // Liste zuerst, Auswahl darunter: der "+"-Knopf steht so immer direkt
      // unter der zuletzt hinzugefügten Zeile (kein Hochscrollen mehr nötig)
      root.appendChild(container);

      const emptyHint = el('p', 'empty-hint');
      emptyHint.textContent = 'Noch nichts erfasst – unten auswählen und mit „+“ hinzufügen.';
      root.appendChild(emptyHint);

      if (ui) root.appendChild(ui);

      if (addBtn) {
        addBtn.addEventListener('click', () => {
          if (!select.value) return;
          const row = buildDynamicRow(i, select.value);
          if (row) {
            notifyChanged();
            focusFirstField(row);
          }
          select.value = '';
        });
      }

      if (bulkBtn) {
        bulkBtn.addEventListener('click', () => openBulkDialog(i));
      }
    }
  });

  // ---------- Dynamik "ohne Beanstandungen" (Ja/Nein) ----------
  (function setupOhneBeanstandungen() {
    const select = form.querySelector('select[name="ohne_beanstandungen"]');
    if (!select) return;

    const selectRow = select.closest('.form-group');

    const ensureMaengelTextarea = () => {
      let wrap = form.querySelector('#maengel_dynamic_wrap');
      if (!wrap) {
        wrap = document.createElement('div');
        wrap.id = 'maengel_dynamic_wrap';
        wrap.className = 'form-group';
        const lab = document.createElement('label');
        lab.textContent = 'Die Wohnung weist folgende Mängel auf:';
        const id = uid('maengel');
        lab.htmlFor = id;
        wrap.appendChild(lab);
        const ta = document.createElement('textarea');
        ta.name = 'maengel_liste';
        ta.id = id;
        wrap.appendChild(ta);
        selectRow.parentNode.insertBefore(wrap, selectRow.nextSibling);
      }
    };

    const removeMaengelTextarea = () => {
      const wrap = form.querySelector('#maengel_dynamic_wrap');
      if (wrap) wrap.remove();
    };

    const onChange = () => {
      if (select.value === 'Nein') {
        ensureMaengelTextarea();
      } else {
        removeMaengelTextarea();
      }
    };

    select.addEventListener('change', onChange);
    onChange(); // Initialzustand
  })();

  // ---------- Dynamik "Kaution -> Ratenzahlung" ----------
  (function setupKautionRatenzahlung() {
    const select = form.querySelector('select[name="kaution_bezahlart"]');
    if (!select) return;

    const selectRow = select.closest('.form-group');

    const ensureRateField = () => {
      let wrap = form.querySelector('#kaution_rate_wrap');
      if (!wrap) {
        wrap = document.createElement('div');
        wrap.id = 'kaution_rate_wrap';
        wrap.className = 'form-group';

        const lab = document.createElement('label');
        lab.textContent = 'Die Höhe der monatlich zu zahlenden Rate beträgt (EUR):';
        const id = uid('rate');
        lab.htmlFor = id;
        wrap.appendChild(lab);

        const inp = document.createElement('input');
        inp.type = 'text';
        inp.name = 'kaution_rate_monat';
        inp.id = id;
        applyInputHints(inp, 'kaution_rate_monat', 'text');
        wrap.appendChild(inp);

        selectRow.parentNode.insertBefore(wrap, selectRow.nextSibling);
      }
    };

    const removeRateField = () => {
      document.querySelector('#kaution_rate_wrap')?.remove();
    };

    const onChange = () => {
      if (select.value === 'Ratenzahlung') {
        ensureRateField();
      } else {
        removeRateField();
      }
    };

    select.addEventListener('change', onChange);
    onChange(); // Initialzustand
  })();

  // ---------- Formular-Zustand: leeren / serialisieren / wiederherstellen ----------
  const clearFormState = () => {
    form.reset();
    sections.forEach((_, i) => {
      const c = document.getElementById(`fields-container-${i}`);
      if (c) c.innerHTML = '';
    });
    form.querySelector('#maengel_dynamic_wrap')?.remove();
    form.querySelector('#kaution_rate_wrap')?.remove();
    if (out) out.style.display = 'none';
    ensureDefaultDatum();
  };

  const serializeState = () => {
    // Welche dynamischen Zeilen wurden hinzugefügt (in Reihenfolge)?
    const dynamic = [];
    sections.forEach((_, i) => {
      const c = document.getElementById(`fields-container-${i}`);
      if (!c) return;
      [...c.children].forEach(rowEl => {
        if (rowEl.dataset && rowEl.dataset.option) {
          dynamic.push({ section: i, option: rowEl.dataset.option });
        }
      });
    });

    // Werte pro Feldname in DOM-Reihenfolge (Mehrfachfelder => mehrere Einträge)
    const values = {};
    form.querySelectorAll('input, textarea, select').forEach(inp => {
      if (!inp.name) return;
      const v = inp.type === 'checkbox' ? (inp.checked ? 'on' : '') : inp.value;
      if (!values[inp.name]) values[inp.name] = [];
      values[inp.name].push(v);
    });

    return { dynamic, values };
  };

  const restoreState = (state) => {
    clearFormState();

    (Array.isArray(state?.dynamic) ? state.dynamic : []).forEach(d => {
      buildDynamicRow(d.section, d.option);
    });

    const values = state?.values || {};

    // Erst die Auswahlfelder mit Folgefeldern setzen, damit die dynamischen
    // Zusatzfelder (Mängel-Liste, Kautions-Rate) vor dem Befüllen existieren
    ['ohne_beanstandungen', 'kaution_bezahlart'].forEach(name => {
      const selEl = form.querySelector(`select[name="${name}"]`);
      const vals = values[name];
      if (selEl && Array.isArray(vals) && vals[0]) {
        selEl.value = vals[0];
        selEl.dispatchEvent(new Event('change'));
      }
    });

    // Alle Werte in DOM-Reihenfolge zurückschreiben
    const counters = {};
    form.querySelectorAll('input, textarea, select').forEach(inp => {
      if (!inp.name) return;
      const arr = values[inp.name];
      if (!Array.isArray(arr)) return;
      const idx = counters[inp.name] = (counters[inp.name] ?? -1) + 1;
      if (idx >= arr.length) return;
      if (inp.type === 'checkbox') inp.checked = arr[idx] === 'on';
      else inp.value = arr[idx];
    });

    ensureDefaultDatum();
  };

  // API für records.js (automatische Zwischenspeicherung + Vorgangsverwaltung)
  window.UebergabeForm = {
    serialize: serializeState,
    restore: restoreState,
    clearForm: clearFormState
  };

  // Falls records.js nicht lädt: Datum trotzdem vorbelegen
  ensureDefaultDatum();

  // ---------- Reset ----------
  document.getElementById('reset-btn')?.addEventListener('click', () => {
    if (!confirm('Alle Eingaben löschen?')) return;
    clearFormState();
    notifyChanged();
  });

  // ---------- Schnellnavigation: Abschnitts-Sprungmenü + "nach oben" ----------
  (function setupQuickNav() {
    const headings = [...root.querySelectorAll('h2')];
    if (!headings.length) return;

    const nav = el('div', 'quick-nav no-print');

    const menu = el('div', 'quick-nav-menu');
    menu.style.display = 'none';
    headings.forEach(h => {
      const b = document.createElement('button');
      b.type = 'button';
      b.textContent = h.textContent;
      b.addEventListener('click', () => {
        menu.style.display = 'none';
        h.scrollIntoView({ block: 'start', behavior: 'smooth' });
      });
      menu.appendChild(b);
    });

    const menuBtn = el('button', 'quick-nav-btn');
    menuBtn.type = 'button';
    menuBtn.textContent = '≡';
    menuBtn.title = 'Zu Abschnitt springen';
    menuBtn.setAttribute('aria-label', 'Zu Abschnitt springen');
    menuBtn.addEventListener('click', () => {
      menu.style.display = menu.style.display === 'none' ? '' : 'none';
    });

    const topBtn = el('button', 'quick-nav-btn');
    topBtn.type = 'button';
    topBtn.textContent = '▲';
    topBtn.title = 'Zum Seitenanfang';
    topBtn.setAttribute('aria-label', 'Zum Seitenanfang');
    topBtn.addEventListener('click', () => {
      menu.style.display = 'none';
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });

    nav.appendChild(menu);
    nav.appendChild(menuBtn);
    nav.appendChild(topBtn);
    document.body.appendChild(nav);

    // Menü schließen, wenn außerhalb getippt wird
    document.addEventListener('pointerdown', (e) => {
      if (menu.style.display !== 'none' && !nav.contains(e.target)) {
        menu.style.display = 'none';
      }
    });
  })();

  // ---------- Echte PDF mit pdf-lib (SAFE MODE) ----------
  document.getElementById('pdf-btn')?.addEventListener('click', async () => {
    try {
      if (!window.PDFLib) {
        alert('PDF-Bibliothek (pdf-lib) nicht geladen. Prüfe <script src="./vendor/pdf-lib.min.js"> und den Pfad.');
        return;
      }
      const { PDFDocument, StandardFonts, rgb } = PDFLib;

      // Farben / Maße
      const COLOR_PRIMARY = rgb(0x3b / 255, 0x53 / 255, 0x70 / 255);      // #3b5370
      const COLOR_PRIMARY_DARK = rgb(0x3b / 255, 0x53 / 255, 0x70 / 255); // #3b5370
      const COLOR_SECTION_BG = rgb(0xf7 / 255, 0xfa / 255, 0xff / 255);
      const COLOR_BORDER = rgb(0xdd / 255, 0xdd / 255, 0xdd / 255);
      const COLOR_TEXT = rgb(0, 0, 0);
      const COLOR_MUTED = rgb(0.45, 0.45, 0.45);

      const PAGE_W = 595, PAGE_H = 842, MARGIN = 36;
      const COL_LABEL_W = 210;
      const COL_VALUE_W = PAGE_W - 2 * MARGIN - COL_LABEL_W;

      // Hinweistext (Rechtschreibung modernisiert)
      const NOTE_TEXT = `Dem Mieter wurde ein Merkblatt zum ordnungsgemäßen Heizen und Lüften der Wohnung übergeben.

Der Mieter wurde darüber informiert, dass der Keller nicht zum Abstellen feuchteempfindlicher Gegenstände geeignet ist. Eine Haftung durch den Vermieter bei evtl. auftretenden Schäden ist ausgeschlossen.

Die Wohnungsgeberbescheinigung wurde heute am Tag der Übergabe an den Mieter übergeben. 
Bei Verlust und Neuausstellung wird eine Gebühr in Höhe von 25,00 EUR zzgl. MwSt. fällig.`;

      // Form-Daten einsammeln
      const fd = new FormData(form);
      const data = {};
      for (const [k, v] of fd.entries()) (k in data) ? (Array.isArray(data[k]) ? data[k].push(v) : data[k] = [data[k], v]) : (data[k] = v);
      const asStr = x => (x ?? '').toString().trim();
      const isOn = x => asStr(x).toLowerCase() === 'on';
      const isISO = s => /^\d{4}-\d{2}-\d{2}$/.test(s);
      const toDE = s => (isISO(s = asStr(s))) ? s.split('-').reverse().join('.') : s;

      // ---------- Vollständigkeits-Hinweis (nur Hinweis, kein Zwang) ----------
      const allgemein = sections.find(s => s.title === 'Allgemeine Daten');
      const fehlende = (allgemein?.fields || [])
        .filter(f => !asStr(data[f.name]))
        .map(f => '– ' + f.label);
      if (fehlende.length) {
        const weiter = confirm(
          'Hinweis – folgende Angaben sind noch leer:\n\n' + fehlende.join('\n') +
          '\n\nTrotzdem PDF erzeugen?'
        );
        if (!weiter) return;
      }

      // PDF + Standardfonts (keine externen Font/Logo-Loads)
      const pdf = await PDFDocument.create();
      const fontRegular = await pdf.embedFont(StandardFonts.Helvetica);
      const fontBold = await pdf.embedFont(StandardFonts.HelveticaBold);

      // Logo einbetten (offline-sicher)
      let logoImg = null;
      try {
        if (window.LOGO_PNG_BASE64) {
          const b64 = window.LOGO_PNG_BASE64.split(',').pop();
          const bytes = Uint8Array.from(atob(b64), c => c.charCodeAt(0));
          logoImg = await pdf.embedPng(bytes);
        } else {
          const res = await fetch('./img/logo.png');
          if (res.ok) {
            const bytes = await res.arrayBuffer();
            logoImg = await pdf.embedPng(bytes);
          } else {
            console.warn('Logo-Response nicht OK');
          }
        }
      } catch (e) {
        console.warn('Logo konnte nicht geladen werden:', e);
      }

      // Seite + Cursor
      let page = pdf.addPage([PAGE_W, PAGE_H]);
      let cursorY = PAGE_H - MARGIN;

      // Helpers
      const textW = (t, size = 10, bold = false) =>
        (bold ? fontBold : fontRegular).widthOfTextAtSize(sanitize(t), size);

      const drawText = (t, x, y, size = 10, color = COLOR_TEXT, bold = false) =>
        page.drawText(sanitize(t), { x, y, size, font: bold ? fontBold : fontRegular, color });

      const sanitize = (s) => String(s ?? '')
        .replace(/\r\n?/g, '\n')           // normalisiere CRLF
        .replace(/\u20AC/g, 'EUR')         // € -> EUR
        .replace(/[\u2018\u2019]/g, "'")   // ’‘ -> '
        .replace(/[\u201C\u201D]/g, '"')   // ”“ -> "
        .replace(/\u00A0/g, ' ')           // NBSP -> Space
        .replace(/[\x00-\x09\x0B-\x1F]/g, ''); // Control-Chars außer \n raus


      const wrap = (txt, maxW, size = 10, bold = false) => {
        const paras = sanitize(txt).split('\n'); // WICHTIG: nach sanitize
        const out = [];
        for (const para of paras) {
          if (para === '') { out.push(''); continue; }
          const words = para.split(/\s+/);
          let line = '';
          for (const w of words) {
            const test = line ? line + ' ' + w : w;
            if (textW(test, size, bold) <= maxW) line = test;
            else { if (line) out.push(line); line = w; }
          }
          out.push(line);
        }
        return out;
      };

      const drawHeader = () => {
        page.drawRectangle({ x: 0, y: PAGE_H - 6, width: PAGE_W, height: 6, color: COLOR_PRIMARY });
       if (logoImg) {
          const LOGO_H = 40;
          const scale  = LOGO_H / logoImg.height;
          const LOGO_W = logoImg.width * scale;
        
          // Titel-Geometrie
          const tSize = 18;
          const titleBaselineY = PAGE_H - MARGIN - 10;
        
          // Grobe metrische Annahmen für Helvetica:
          const ASCENT = 0.8, DESCENT = 0.2;      // ~80% hoch, ~20% tief
          const titleCenterY = titleBaselineY + (ASCENT - DESCENT) * tSize / 2 - DESCENT * tSize;

         // Feinjustierung: positiver Wert verschiebt nach oben
          const LOGO_OFFSET_Y = 6;
        
          // Logo so platzieren, dass sein Mittelpunkt = Titelmittelpunkt
          const yLogo = titleCenterY - LOGO_H / 2 + LOGO_OFFSET_Y;
        
          page.drawImage(logoImg, {
            x: MARGIN,         // links bleibt
            y: yLogo,
            width: LOGO_W,
            height: LOGO_H
          });
        }
        
        const title = 'Wohnungsübergabeprotokoll', tSize = 18, tW = textW(title, tSize, true);
        drawText(title, PAGE_W - MARGIN - tW, PAGE_H - MARGIN - 10, tSize, COLOR_PRIMARY_DARK, true);
        const y = PAGE_H - MARGIN - 28;
        page.drawLine({ start: { x: MARGIN, y }, end: { x: PAGE_W - MARGIN, y }, thickness: 0.5, color: COLOR_BORDER });
        cursorY = y - 10;
      };
      const ensureSpace = (need) => {
        if (cursorY - need < MARGIN) {
          page = pdf.addPage([PAGE_W, PAGE_H]);
          cursorY = PAGE_H - MARGIN;
          drawHeader(); // setzt cursorY
        }
      };
      const drawFooterForAllPages = (pdfDoc, font) => {
        const pages = pdfDoc.getPages();
        const fs = 9, textY = 10, lineY = MARGIN - 6;
        pages.forEach((p, i) => {
          const label = `Seite ${String(i + 1).padStart(2, '0')} von ${String(pages.length).padStart(2, '0')}`;
          p.drawLine({ start: { x: MARGIN, y: lineY }, end: { x: PAGE_W - MARGIN, y: lineY }, thickness: 0.5, color: COLOR_BORDER });
          const tw = font.widthOfTextAtSize(label, fs);
          p.drawText(label, { x: PAGE_W - MARGIN - tw, y: textY, size: fs, font, color: COLOR_MUTED });
        });
      };
      drawHeader();

      // --- Einstellungen für H1-Abstand & bedingten Umbruch
      const EXTRA_HEADING_GAP = 18;
      const HEADING_BOX_H = 28;
      const LOWER_QUARTER = PAGE_H * 0.25;
      const forcePageBreakIfLow = (threshold = LOWER_QUARTER) => {
        const remaining = cursorY - MARGIN;
        if (remaining < threshold) {
          page = pdf.addPage([PAGE_W, PAGE_H]);
          cursorY = PAGE_H - MARGIN;
          drawHeader();
        }
      };

      // Tabellenhelpers
      const CELL_PAD = 6, FONT_SIZE = 10;
      const measureRowH = (lab, val) => {
        const labLines = wrap(lab, COL_LABEL_W - 2 * CELL_PAD, FONT_SIZE);
        const valLines = Array.isArray(val)
          ? val.flatMap(v => wrap(String(v), COL_VALUE_W - 2 * CELL_PAD, FONT_SIZE))
          : wrap(val, COL_VALUE_W - 2 * CELL_PAD, FONT_SIZE);
        const lines = Math.max(labLines.length, valLines.length);
        return lines * (FONT_SIZE + 3) + 2 * CELL_PAD;
      };
      const measureKVTableHeight = rows => rows.reduce((s, [a, b]) => s + measureRowH(a, b), 0) + 8;


      const drawSectionHeader = (title) => {
        const h = 22;
        ensureSpace(h + 10);
        page.drawRectangle({ x: MARGIN, y: cursorY - h, width: PAGE_W - 2 * MARGIN, height: h, color: COLOR_SECTION_BG });
        page.drawRectangle({ x: MARGIN, y: cursorY - h, width: 4, height: h, color: COLOR_PRIMARY });
        drawText(title, MARGIN + 10, cursorY - 14, 12, COLOR_PRIMARY_DARK, true);
        cursorY -= h + 6;
      };

      const drawH1 = (t) => {
        forcePageBreakIfLow();
        const need = EXTRA_HEADING_GAP + HEADING_BOX_H + 6;
        ensureSpace(need);
        cursorY -= EXTRA_HEADING_GAP;
        const h = HEADING_BOX_H;
        page.drawRectangle({ x: MARGIN, y: cursorY - h, width: PAGE_W - 2 * MARGIN, height: h, color: COLOR_SECTION_BG });
        const fs = 14;
        const tw = textW(t, fs, true);
        drawText(t, MARGIN + ((PAGE_W - 2 * MARGIN) - tw) / 2, cursorY - 18, fs, COLOR_PRIMARY_DARK, true);
        cursorY -= h + 8;
      };

      const drawKVTable = (rows) => {
        if (!rows.length) return;
        const tableX = MARGIN, tableW = PAGE_W - 2 * MARGIN;
        let y = cursorY;
        rows.forEach(([lab, val]) => {
          const rowH = measureRowH(lab, val);
          page.drawLine({ start: { x: tableX, y }, end: { x: tableX + tableW, y }, thickness: 0.5, color: COLOR_BORDER });
          page.drawLine({ start: { x: tableX + COL_LABEL_W, y }, end: { x: tableX + COL_LABEL_W, y: y - rowH }, thickness: 0.5, color: COLOR_BORDER });

          let txtY = y - CELL_PAD - FONT_SIZE;
          wrap(lab, COL_LABEL_W - 2 * CELL_PAD, FONT_SIZE).forEach(line => {
            drawText(line, tableX + CELL_PAD, txtY, FONT_SIZE);
            txtY -= (FONT_SIZE + 3);
          });

          txtY = y - CELL_PAD - FONT_SIZE;
          const valLines = Array.isArray(val) ? val.flatMap(v => wrap(String(v), COL_VALUE_W - 2 * CELL_PAD, FONT_SIZE))
            : wrap(val, COL_VALUE_W - 2 * CELL_PAD, FONT_SIZE);
          valLines.forEach(line => {
            drawText(line, tableX + COL_LABEL_W + CELL_PAD, txtY, FONT_SIZE);
            txtY -= (FONT_SIZE + 3);
          });

          page.drawLine({ start: { x: tableX, y: y - rowH }, end: { x: tableX + tableW, y: y - rowH }, thickness: 0.5, color: COLOR_BORDER });
          y -= rowH;
        });
        cursorY = y - 8;
      };

      // form_sections -> Tabellen
      window.form_sections.forEach(section => {
        if (section.type === 'heading') {
          drawH1(section.title);
          return;
        }
        const rows = [];
        const isMaengel = section.title === 'Mängelregelung';
        let skip = false;
        if (isMaengel) {
          const sel = asStr(data['ohne_beanstandungen']);
          if (sel) {
            rows.push(['Die Wohnungsübergabe erfolgte ohne Beanstandungen', sel]);
            if (sel === 'Ja') skip = true;
            else {
              const liste = asStr(data['maengel_liste']);
              if (liste) rows.push(['Die Wohnung weist folgende Mängel auf', liste]);
            }
          }
        }
        if (!(isMaengel && skip)) {
          (section.fields || []).forEach(f => {
            if (isMaengel && f.name === 'ohne_beanstandungen') return;
            const v = data[f.name];
            if (Array.isArray(v)) v.forEach((vv, i) => { if (asStr(vv)) rows.push([`${f.label} (${i + 1})`, toDE(vv)]) });
            else if (asStr(v)) rows.push([f.label, toDE(v)]);
          });
        }
        (section.options || []).forEach(opt => {
          const sub = opt.subfields || [], fld = opt.fields || [];
          if (sub.length) {
            const maxN = Math.max(0, ...sub.map(sf => Array.isArray(data[sf.name]) ? data[sf.name].length : asStr(data[sf.name]) ? 1 : 0));
            for (let i = 0; i < maxN; i++) {
              const inner = [];
              sub.forEach(sf => {
                const vi = Array.isArray(data[sf.name]) ? data[sf.name][i] : (i === 0 ? data[sf.name] : undefined);
                const s = asStr(vi);
                if (sf.type === 'checkbox') { if (isOn(s)) inner.push(`${sf.label}: Ja`); }
                else if (s) inner.push(`${sf.label}: ${toDE(s)}`);
              });
              if (inner.length) rows.push([maxN > 1 ? `${opt.label} (${i + 1})` : opt.label, inner]);
            }
          } else if (fld.length) {
            const maxN = Math.max(0, ...fld.map(f => Array.isArray(data[f.name]) ? data[f.name].length : asStr(data[f.name]) ? 1 : 0));
            for (let i = 0; i < maxN; i++) {
              const inner = [];
              fld.forEach(f => {
                const vi = Array.isArray(data[f.name]) ? data[f.name][i] : (i === 0 ? data[f.name] : undefined);
                const s = asStr(vi);
                if (f.type === 'checkbox') { if (isOn(s)) inner.push(`${f.label}: Ja`); }
                else if (s) inner.push(`${f.label}: ${s}`);
              });
              if (inner.length) rows.push([maxN > 1 ? `${opt.label} (${i + 1})` : opt.label, inner]);
            }
          }
        });
        // Zusatzzeile für Kaution bei Ratenzahlung
        if (section.title === 'Kaution') {
          const bezArt = asStr(data['kaution_bezahlart']);
          const rate = asStr(data['kaution_rate_monat']);
          if (bezArt === 'Ratenzahlung' && rate) {
            rows.push(['Die Höhe der monatlich zu zahlenden Rate beträgt (EUR):', rate]);
          }
        }

        if (!rows.length) return;

        const introMap = {
          'Zählerstände': 'Nachfolgende Zählerstände wurden bei der Wohnungsübergabe von beiden Parteien abgelesen.\nDie Anmeldung bei der Energieversorgung (Strom) erfolgt durch den Vermieter.',
        };
        const introRows = introMap[section.title] ? [['', introMap[section.title]]] : [];

        const need = (22 + 6) + measureKVTableHeight(introRows) + measureKVTableHeight(rows);
        ensureSpace(need);

        drawSectionHeader(section.title);
        if (introRows.length) drawKVTable(introRows);
        drawKVTable(rows);

        // Hinweisblock nach "Kaution"
        if (section.title === 'Kaution') {
          cursorY -= 6;
          const PAD_X = 10, PAD_Y = 8, FS = 10, LINE = FS + 3;
          const lines = wrap(NOTE_TEXT, (PAGE_W - 2 * MARGIN) - 2 * PAD_X - 4, FS);
          let i = 0;
          while (i < lines.length) {
            const avail = cursorY - MARGIN;
            const maxLines = Math.max(1, Math.floor((avail - 2 * PAD_Y) / LINE));
            const slice = lines.slice(i, i + maxLines);
            const blockH = slice.length * LINE + 2 * PAD_Y;

            ensureSpace(blockH);
            page.drawRectangle({ x: MARGIN, y: cursorY - blockH, width: PAGE_W - 2 * MARGIN, height: blockH, color: COLOR_SECTION_BG, borderColor: COLOR_BORDER, borderWidth: 0.5 });
            page.drawRectangle({ x: MARGIN, y: cursorY - blockH, width: 4, height: blockH, color: COLOR_PRIMARY });

            let y = cursorY - PAD_Y - FS;
            slice.forEach(line => {
              if (line === '') { y -= LINE; }
              else { drawText(line, MARGIN + PAD_X + 4, y, FS, COLOR_TEXT); y -= LINE; }
            });

            cursorY -= blockH + 8;
            i += slice.length;
          }
        }
      });

      // Unterschriften
      const rawDate = data['datum'];
      let header = 'Dresden, den .............................';
      if (asStr(rawDate)) {
        try { const d = new Date(rawDate); header = `Dresden, den ${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}.${d.getFullYear()}`; } catch { }
      }

      const fieldH = 90, gap = 16, halfW = (PAGE_W - 2 * MARGIN - gap) / 2;
      const needSig = (22 + 6) + measureKVTableHeight([['', header]]) + fieldH + 30;
      ensureSpace(needSig);

      drawSectionHeader('Unterschriften');
      const drawKVTableOnce = (rows) => {
        const saveCursor = cursorY;
        const height = measureKVTableHeight(rows);
        ensureSpace(height);
        drawKVTable(rows);
        return saveCursor - cursorY;
      };
      drawKVTableOnce([['', header]]);

      const topY = cursorY - 6;
      const drawSignBox = (x, y, w, h, legend) => {
        const PAD_TOP = 12, PAD_X = 14, fs = 9;
        page.drawRectangle({ x, y: y - h, width: w, height: h, borderWidth: 1, borderColor: COLOR_TEXT });
        const lines = wrap(legend, w - 2 * PAD_X, fs, true);
        let base = y - PAD_TOP - fs;
        lines.forEach(line => {
          const lw = textW(line, fs, true);
          drawText(line, x + (w - lw) / 2, base, fs, COLOR_TEXT, true);
          base -= (fs + 2);
        });
        const signY = y - h + 26;
        page.drawLine({ start: { x: x + 20, y: signY }, end: { x: x + w - 20, y: signY }, thickness: 0.8, color: COLOR_TEXT });
      };
      drawSignBox(MARGIN, topY, halfW, fieldH, 'Unterschrift des Vermieters bzw. seines Bevollmächtigten');
      drawSignBox(MARGIN + halfW + gap, topY, halfW, fieldH, 'Unterschrift des Mieters bzw. seines Bevollmächtigten');
      cursorY = topY - fieldH - 30;

      // Footer zeichnen, dann Dokument EINMAL speichern (Basis für die Vorschau).
      // Ein zweites save() desselben Dokuments ist browserabhängig fehleranfällig.
      drawFooterForAllPages(pdf, fontRegular);
      let pdfBytes = await pdf.save();

      // ===== Vorschau der fertigen PDF + Unterschriften erfassen =====
      if (window.AbnahmeSignature) {
        const sigBoxes = {
          vermieter: { x: MARGIN, y: topY, w: halfW, h: fieldH },
          mieter: { x: MARGIN + halfW + gap, y: topY, w: halfW, h: fieldH }
        };

        const sigs = await window.AbnahmeSignature.collect(pdfBytes);
        if (sigs === null) return; // Abbrechen gedrückt -> keine PDF erzeugen

        if (sigs.vermieter || sigs.mieter) {
          // Unterschriften in eine frische Kopie exakt der Vorschau-Bytes einbetten
          const signedDoc = await PDFDocument.load(pdfBytes);
          const lastPage = signedDoc.getPage(signedDoc.getPageCount() - 1);

          const placeSig = async (dataUrl, box) => {
            if (!dataUrl) return;
            const img = await signedDoc.embedPng(dataUrl);
            const lineY = box.y - box.h + 26; // Signaturlinie (siehe drawSignBox)
            const maxW = box.w - 44;
            const maxH = 32;
            const scale = Math.min(maxW / img.width, maxH / img.height);
            const w = img.width * scale;
            const h = img.height * scale;
            lastPage.drawImage(img, {
              x: box.x + (box.w - w) / 2,
              y: lineY + 2, // direkt auf der Linie aufsitzend
              width: w,
              height: h
            });
          };

          await placeSig(sigs.vermieter, sigBoxes.vermieter);
          await placeSig(sigs.mieter, sigBoxes.mieter);
          pdfBytes = await signedDoc.save();
        }
      }

      // Dateiname mit Adresse/Datum (hilft in der Dateien-App bei mehreren Übergaben)
      const fnSafe = s => asStr(s).replace(/[^\wäöüÄÖÜß\- ]+/g, '').trim().replace(/\s+/g, '-').slice(0, 60);
      const filename = ['Wohnungsübergabeprotokoll',
        fnSafe(data['strasse_hausnummer']),
        fnSafe(data['wohnung_nr_etage_objekt']),
        asStr(data['datum'])
      ].filter(Boolean).join('_') + '.pdf';

      // PDF im aktuellen Vorgang sichern (records.js), bevor sie den Nutzer erreicht
      try {
        document.dispatchEvent(new CustomEvent('abnahme:pdf', { detail: { bytes: pdfBytes, filename } }));
      } catch (e) { }

      // PDF direkt anzeigen/herunterladen (Mitarbeiter-Entscheidung Juli 2026):
      // Safari zeigt die PDF in ganzer Ansicht; gespeichert und unterschrieben
      // wird über das Teilen-Menü der PDF-Ansicht (Apple Dateien + Markierung).
      // Der Formularstand ist davor gesichert; autocomplete="off" + der
      // pageshow-Handler in records.js verhindern Datenverlust beim Zurückgehen.
      const blob = new Blob([pdfBytes], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = filename;
      document.body.appendChild(a); a.click(); a.remove();
      // Bewusst KEIN revokeObjectURL: Safari muss die URL auch beim späteren
      // Teilen aus der PDF-Ansicht noch auflösen können; der Speicher wird
      // beim nächsten Seitenwechsel automatisch freigegeben.
    } catch (err) {
      console.error('PDF-Fehler:', err);
      alert('PDF-Erstellung fehlgeschlagen. Siehe Konsole für Details.');
    }
  });

  // ---------- Service Worker Version Info ----------
  if (navigator.serviceWorker && navigator.serviceWorker.controller) {
    navigator.serviceWorker.controller.postMessage('getVersion');
    navigator.serviceWorker.addEventListener('message', e => {
      if (e.data?.type === 'version') {
        const vEl = document.getElementById('version-info');
        if (vEl) vEl.textContent = 'Version: ' + e.data.version;
      }
    });
  }
})();
