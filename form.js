(function () {
  // ---------- Globals / Refs ----------
  const sections = Array.isArray(window.form_sections) ? window.form_sections : [];
  const root = document.getElementById('sections-root');
  const form = document.getElementById('uebergabe-form');
  const out = document.getElementById('submitted');
  const saveKeyData = 'uebergabe_form_data';
  const saveKeyLayout = 'uebergabe_form_layout';

  // ---------- Utils ----------
  const el = (tag, cls) => {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    return n;
  };

  // simple uid counter for input IDs
  let __uid = 0;
  const uid = (prefix = 'f') => `${prefix}_${(++__uid).toString(36)}`;

  // iPad-/Tastatur-Hilfen + dezimale Eingaben
  const applyInputHints = (input, name, type) => {
    const nm = String(name || '').toLowerCase();

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

    wrap.appendChild(sel);
    wrap.appendChild(addBtn);

    return { ui: wrap, select: sel, addBtn };
  };

  const makeRemoveBtn = (onRemove) => {
    const rm = el('button', 'remove-btn');
    rm.type = 'button';
    rm.textContent = 'Entfernen';
    rm.setAttribute('aria-label', 'Feld entfernen');
    rm.addEventListener('click', () => onRemove?.());
    return rm;
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
      const { ui, select, addBtn } = controls;
      const container = el('div');
      container.id = `fields-container-${i}`;

      if (ui) root.appendChild(ui);
      root.appendChild(container);

      if (addBtn) {
        addBtn.addEventListener('click', () => {
          const optEl = select.selectedOptions[0];
          if (!optEl || !optEl.value) return;

          const sectionTitle = (select.dataset.sectionTitle || '').trim();
          const type = optEl.dataset.type;
          const label = optEl.textContent;
          const subfields = optEl.dataset.subfields ? JSON.parse(optEl.dataset.subfields) : [];

          // --- Spezial: Weitere Räume ---
          if (sectionTitle === 'Weitere Räume') {
            const card = el('div', 'field-item');
            card.style.flexDirection = 'column';
            card.style.alignItems = 'stretch';
            card.setAttribute('role', 'group');
            card.dataset.label = label; // für Layout-Persistenz

            const head = el('div');
            head.style.display = 'flex';
            head.style.alignItems = 'center';
            head.style.gap = '10px';

            const strong = document.createElement('strong');
            strong.textContent = label;
            strong.id = uid('lbl');
            head.appendChild(strong);

            const removeRoomBtn = makeRemoveBtn(() => card.remove());
            head.appendChild(removeRoomBtn);
            card.appendChild(head);

            // Felder aus option.fields rendern
            const fields = Array.isArray(subfields) && subfields.length && subfields[0]?.label
              ? subfields
              : (optEl.dataset.fields ? JSON.parse(optEl.dataset.fields) : []);

            let optionObj = null;
            if (!fields.length && Array.isArray(section.options)) {
              optionObj = section.options.find(o => o.name === optEl.value || o.label === label);
            }
            const finalFields = fields.length ? fields : (optionObj?.fields || []);

            finalFields.forEach(f => {
              addLabelInput(card, f.label, f.name, f.type, f.checked, f.options);
            });

            container.appendChild(card);
            select.value = '';
            return;
          }

          // --- Standard: Gruppe mit Subfeldern oder Einzel-Feld ---
          if (type === 'multi' && Array.isArray(subfields) && subfields.length) {
            const wrap = el('div', 'field-item');
            wrap.setAttribute('role', 'group');
            wrap.dataset.label = label; // für Layout-Persistenz
            const strong = document.createElement('strong');
            strong.textContent = label;
            strong.id = uid('lbl');
            wrap.appendChild(strong);

            subfields.forEach(sf => {
              const lab = document.createElement('label');
              const id = uid(sf.name || 'sf');
              lab.textContent = sf.label;
              lab.htmlFor = id;
              wrap.appendChild(lab);

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
                (sf.options || []).forEach(opt => {
                  const o = document.createElement('option');
                  o.value = String(opt?.value ?? opt);
                  o.textContent = String(opt?.label ?? opt);
                  input.appendChild(o);
                });
              } else {
                input = document.createElement('input');
                input.type = sf.type || 'text';
              }
              input.name = sf.name;
              input.id = id;
              applyInputHints(input, sf.name, sf.type);
              wrap.appendChild(input);
            });

            const rm = makeRemoveBtn(() => wrap.remove());
            wrap.appendChild(rm);
            container.appendChild(wrap);
          } else {
            const row = el('div', 'field-item');
            row.setAttribute('role', 'group');
            row.dataset.label = label; // für Layout-Persistenz

            const lab = document.createElement('label');
            const id = uid(optEl.value);
            lab.textContent = label;
            lab.htmlFor = id;
            row.appendChild(lab);

            const input = document.createElement('input');
            input.name = optEl.value;
            input.type = type || 'text';
            input.id = id;
            applyInputHints(input, input.name, input.type);
            row.appendChild(input);

            const rm = makeRemoveBtn(() => row.remove());
            row.appendChild(rm);

            container.appendChild(row);
          }

          select.value = '';
        });
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

  // ---------- Speichern (Anzeige + LocalStorage) ----------
  const saveBtn = document.getElementById('save-btn');
  saveBtn?.addEventListener('click', () => {
    const fd = new FormData(form);
    const entries = {};
    for (const [k, v] of fd.entries()) {
      if (k in entries) {
        // Mehrfachwerte zu Array
        const curr = entries[k];
        entries[k] = Array.isArray(curr) ? curr.concat([v]) : [curr, v];
      } else {
        entries[k] = v;
      }
    }

    // Checkbox-Lücken schließen
    form.querySelectorAll('input[type="checkbox"]').forEach(cb => {
      if (!entries.hasOwnProperty(cb.name)) {
        entries[cb.name] = cb.checked ? 'on' : '';
      }
    });

    // Layout-Metadaten aufnehmen (welche dynamischen Blöcke existieren)
    const layout = {};
    sections.forEach((section, i) => {
      const cid = `fields-container-${i}`;
      const items = [...document.querySelectorAll(`#${cid} .field-item`)];
      if (!items.length) return;
      layout[i] = items.map(it => it.dataset.label || it.querySelector('strong')?.textContent || '');
    });

    // Vorschau
    const ul = document.createElement('ul');
    Object.entries(entries).forEach(([k, v]) => {
      const val = Array.isArray(v) ? v.join(', ') : v;
      if (String(val).trim() === '') return;
      const li = document.createElement('li');
      li.textContent = `${k}: ${val}`;
      ul.appendChild(li);
    });

    out.innerHTML = '<h2>Eingegebene Daten:</h2>';
    out.appendChild(ul);
    out.style.display = 'block';

    try {
      localStorage.setItem(saveKeyData, JSON.stringify(entries));
      localStorage.setItem(saveKeyLayout, JSON.stringify(layout));
    } catch (e) {
      console.warn('Speichern fehlgeschlagen:', e);
    }
  });

  // ---------- Reset ----------
  document.getElementById('reset-btn')?.addEventListener('click', () => {
    if (!confirm('Alle Eingaben löschen?')) return;
    form.reset();
    [...root.querySelectorAll('[id^="fields-container-"]')].forEach(c => c.innerHTML = '');
    out.style.display = 'none';
    try {
      localStorage.removeItem(saveKeyData);
      localStorage.removeItem(saveKeyLayout);
    } catch (e) { console.warn(e); }
    document.querySelector('#maengel_dynamic_wrap')?.remove();
    document.querySelector('#kaution_rate_wrap')?.remove();
  });

  // ---------- Laden (Layout zuerst, dann Werte) ----------
  (function restore() {
    // 1) Layout rekonstruieren (dynamische Blöcke)
    try {
      const layoutRaw = localStorage.getItem(saveKeyLayout);
      const layout = layoutRaw ? JSON.parse(layoutRaw) : {};
      Object.entries(layout).forEach(([i, labels]) => {
        const sel = document.getElementById(`select-${i}`);
        const addBtn = document.querySelector(`.add-btn[data-section="${i}"]`);
        const section = sections[+i];
        if (!sel || !addBtn || !section) return;

        (labels || []).forEach(lbl => {
          // Finde Option nach Label
          const opt = [...sel.options].find(o => o.textContent === lbl);
          if (opt) {
            sel.value = opt.value;
            addBtn.click(); // Block erzeugen
          }
        });
      });
    } catch (e) { console.warn('Layout-Restore fehlgeschlagen:', e); }

    // 2) Werte restaurieren
    try {
      const raw = localStorage.getItem(saveKeyData);
      if (!raw) return;
      const data = JSON.parse(raw);

      // Set simple inputs first
      form.querySelectorAll('input, textarea, select').forEach(inp => {
        if (!inp.name) return;
        if (inp.type === 'checkbox') {
          inp.checked = data[inp.name] === 'on';
        } else if (data[inp.name] != null) {
          const val = data[inp.name];
          if (Array.isArray(val)) {
            // Mehrfachwerte – erster Wert in vorhandenes Feld, Rest bleiben ungesetzt (da separate Inputs)
            inp.value = val[0];
          } else {
            inp.value = val;
          }
        }
      });

      // Sonderfälle sicherstellen (Mängel / Kaution) nach Wertsetzung
      const selM = form.querySelector('select[name="ohne_beanstandungen"]');
      if (selM) selM.dispatchEvent(new Event('change'));
      const selK = form.querySelector('select[name="kaution_bezahlart"]');
      if (selK) selK.dispatchEvent(new Event('change'));

      // Nachträglich spezifische Werte für dynamisch erzeugte Felder zuweisen (Arrays)
      Object.entries(data).forEach(([name, val]) => {
        if (!Array.isArray(val)) return;
        const inputs = [...form.querySelectorAll(`[name="${CSS.escape(name)}"]`)];
        val.forEach((v, idx) => {
          if (inputs[idx]) inputs[idx].value = v;
        });
      });
    } catch (e) { console.warn('Werte-Restore fehlgeschlagen:', e); }
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
      const isISO = s => /^\\d{4}-\\d{2}-\\d{2}$/.test(s);
      const toDE = s => (isISO(s = asStr(s))) ? s.split('-').reverse().join('.') : s;

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

      // Footer + Download
      drawFooterForAllPages(pdf, fontRegular);
      const pdfBytes = await pdf.save();
      const blob = new Blob([pdfBytes], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = 'Wohnungsübergabeprotokoll.pdf';
      document.body.appendChild(a); a.click(); a.remove();
      try { URL.revokeObjectURL(url); } catch { }
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
