// table.js — #/table: matriks 28 indikator × 30 tahun.
// Kontrol yang benar-benar bekerja: pencarian baris, chip sektor (bisa dari URL #/table?s=economy),
// dua slider rentang tahun, pengurutan baris per kolom tahun, dan unduhan CSV (Blob, offline).
import { DATA, METAS, ORDER, SECTORS } from "./data.js";
import { fmt, esc } from "./charts.js";

const YEAR_MIN = 1996, YEAR_MAX = 2025;

export function database(app, params) {
  let sector = params.get("s");
  if (!SECTORS[sector]) sector = null;
  let query = "";
  let y0 = YEAR_MIN, y1 = YEAR_MAX;
  let sortYear = null, sortAsc = false;

  app.innerHTML = `
  <p class="crumb"><a href="#/">Beranda</a> · Database${sector ? ` · ${SECTORS[sector]}` : ""}</p>
  <h1>Database indikator <span style="color:var(--ink-faint);font-weight:400">· ${ORDER.length} deret × ${(YEAR_MAX - YEAR_MIN + 1)} tahun</span></h1>
  <p style="max-width:820px;color:var(--ink-soft)">Matriks lengkap 1996–2025. Klik judul kolom tahun untuk mengurutkan baris,
  geser slider untuk mempersempit rentang, dan unduh apa pun yang tampak di layar sebagai CSV.</p>

  <div class="db-controls">
    <div class="fld"><label for="dbSearch">Cari indikator</label>
      <input type="search" id="dbSearch" placeholder="nama, satuan, kata kunci…" autocomplete="off"></div>
    <div class="fld"><label for="dbY0">Tahun mulai — <span id="dbY0v">${y0}</span></label>
      <div class="range-pair"><input type="range" id="dbY0" min="${YEAR_MIN}" max="${YEAR_MAX}" value="${y0}" step="1"></div></div>
    <div class="fld"><label for="dbY1">Tahun akhir — <span id="dbY1v">${y1}</span></label>
      <div class="range-pair"><input type="range" id="dbY1" min="${YEAR_MIN}" max="${YEAR_MAX}" value="${y1}" step="1"></div></div>
    <button class="btn red" id="dbCsv" type="button">⬇ Unduh CSV</button>
  </div>
  <div class="chips" id="dbSectors" role="group" aria-label="Saring sektor">
    <button class="chip${sector ? "" : " on"}" data-s="" type="button">Semua sektor</button>
    ${Object.entries(SECTORS).map(([s, l]) => `<button class="chip${sector === s ? " on" : ""}" data-s="${s}" type="button">${l}</button>`).join("")}
  </div>
  <p class="db-count" id="dbCount" aria-live="polite"></p>
  <div class="table-scroll" id="dbScroll"></div>`;

  const scroll = document.getElementById("dbScroll");
  const count = document.getElementById("dbCount");

  function filteredKeys() {
    const q = query.trim().toLowerCase();
    return ORDER.filter((k) => {
      if (sector && METAS[k].sector !== sector) return false;
      if (!q) return true;
      const m = METAS[k];
      return `${m.label} ${k} ${m.unit} ${m.desc} ${SECTORS[m.sector]}`.toLowerCase().includes(q);
    });
  }

  function years() {
    const out = [];
    for (let y = Math.min(y0, y1); y <= Math.max(y0, y1); y++) out.push(y);
    return out;
  }

  function cell(key, y) {
    const row = DATA[key].find(([yy]) => yy === y);
    return row ? row[1] : null;
  }

  function paint() {
    const ys = years();
    let keys = filteredKeys();
    const nShown = keys.length;
    if (sortYear != null) {
      keys = [...keys].sort((a, b) => {
        const va = cell(a, sortYear), vb = cell(b, sortYear);
        if (va == null && vb == null) return 0;
        if (va == null) return 1; // kosong selalu ke bawah
        if (vb == null) return -1;
        return (va - vb) * (sortAsc ? 1 : -1);
      });
    }
    const head = `<tr><th class="rowhead">Indikator${query || sector ? ` (${nShown} cocok)` : ""}</th>${
      ys.map((y) => `<th data-y="${y}" class="${sortYear === y ? "sorted" + (sortAsc ? " asc" : "") : ""}">${y}</th>`).join("")}</tr>`;
    const body = keys.map((k) => {
      const m = METAS[k];
      return `<tr><td class="rowhead"><a href="#/indicator/${k}">${m.label}</a><span class="u">${esc(m.unit)}</span></td>${
        ys.map((y) => {
          const v = cell(k, y);
          return `<td class="${v == null ? "miss" : ""}">${v == null ? "–" : fmt(v, m.format)}</td>`;
        }).join("")}</tr>`;
    }).join("");
    scroll.innerHTML = `<table class="db"><thead>${head}</thead><tbody>${body || `<tr><td class="rowhead" colspan="${ys.length + 1}">Tidak ada indikator yang cocok — ubah kata kunci atau sektor.</td></tr>`}</tbody></table>`;
    count.textContent = `Menampilkan ${keys.length} indikator × ${ys.length} tahun (${ys[0]}–${ys[ys.length - 1]})` +
      (sortYear != null ? ` · diurutkan menurut ${sortYear} ${sortAsc ? "menanjak" : "menurun"}` : "") + ".";
  }

  // ---------- penyalaan kontrol ----------
  document.getElementById("dbSearch").addEventListener("input", (e) => { query = e.target.value; paint(); });
  const s0 = document.getElementById("dbY0"), s1 = document.getElementById("dbY1");
  s0.addEventListener("input", () => { y0 = +s0.value; document.getElementById("dbY0v").textContent = y0; paint(); });
  s1.addEventListener("input", () => { y1 = +s1.value; document.getElementById("dbY1v").textContent = y1; paint(); });
  document.getElementById("dbSectors").addEventListener("click", (e) => {
    const b = e.target.closest(".chip");
    if (!b) return;
    sector = b.dataset.s || null;
    document.querySelectorAll("#dbSectors .chip").forEach((c) => c.classList.toggle("on", c === b));
    paint();
  });
  scroll.addEventListener("click", (e) => {
    const th = e.target.closest("th[data-y]");
    if (!th) return;
    const y = +th.dataset.y;
    if (sortYear === y) sortAsc = !sortAsc; else { sortYear = y; sortAsc = false; }
    paint();
  });

  document.getElementById("dbCsv").addEventListener("click", () => {
    const ys = years();
    const keys = (() => {
      const ks = filteredKeys();
      if (sortYear == null) return ks;
      return [...ks].sort((a, b) => {
        const va = cell(a, sortYear), vb = cell(b, sortYear);
        if (va == null && vb == null) return 0;
        if (va == null) return 1;
        if (vb == null) return -1;
        return (va - vb) * (sortAsc ? 1 : -1);
      });
    })();
    const q = (s) => `"${String(s).replace(/"/g, '""')}"`;
    const lines = [["Indikator", "Satuan", "Sektor", ...ys.map(String)].map(q).join(",")];
    keys.forEach((k) => {
      const m = METAS[k];
      lines.push([q(m.label), q(m.unit), q(SECTORS[m.sector]),
        ...ys.map((y) => { const v = cell(k, y); return v == null ? "" : String(v); })].join(","));
    });
    const blob = new Blob(["\ufeff" + lines.join("\r\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `barometer-nusantara_${ys[0]}-${ys.at(-1)}${sector ? "_" + sector : ""}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
  });

  paint();
}
