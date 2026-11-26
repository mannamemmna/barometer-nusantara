// views.js — tiga tampilan utama: ringkasan nasional (#/), detail indikator (#/indicator/<key>),
// dan halaman metodologi (#/about). Berbagi helper statistik dengan table.js.
import { DATA, METAS, ORDER, SECTORS } from "./data.js";
import { lineChart, barChart, sparkSvg, fmt, esc, COLORS } from "./charts.js";

// ---------- helper statistik deret ----------
export function seriesStats(key) {
  const rows = DATA[key];
  const vals = rows.map(([, v]) => v).filter((v) => v != null);
  const first = rows[0], last = rows.at(-1);
  let min = rows[0], max = rows[0];
  rows.forEach((r) => { if (r[1] < min[1]) min = r; if (r[1] > max[1]) max = r; });
  const avg = vals.reduce((a, b) => a + b, 0) / vals.length;
  let cagr = null;
  if (first[1] > 0 && last[1] > 0 && last[0] > first[0]) {
    cagr = Math.pow(last[1] / first[1], 1 / (last[0] - first[0])) - 1;
  }
  return { rows, first, last, min, max, avg, cagr, n: rows.length };
}

export function yoy(key) {
  const rows = DATA[key];
  const last = rows.at(-1), prev = rows.at(-2);
  if (!prev || last[1] == null || prev[1] == null) return null;
  const abs = last[1] - prev[1];
  const rel = prev[1] !== 0 ? (abs / Math.abs(prev[1])) * 100 : null;
  return { year: last[0], prevYear: prev[0], abs, rel };
}

const deltaArrow = (d, cls) => `${d > 0 ? "▲" : d < 0 ? "▼" : "◆"} ${cls}`;

// ---------- #/ ringkasan nasional ----------
export function home(app) {
  const kpis = [
    { key: "population", goodUp: true },
    { key: "gdp", goodUp: true },
    { key: "inflation", goodUp: false }, // inflasi turun = kabar baik
    { key: "unemployment", goodUp: false },
  ];
  let kpiHtml = '<section class="kpi-strip" aria-label="Angka kunci 2025">';
  kpis.forEach(({ key, goodUp }) => {
    const m = METAS[key], s = seriesStats(key), d = yoy(key);
    let delta = '<span class="kpi-delta flat">—</span>';
    if (d) {
      const usePp = m.format === "pct";
      const dv = usePp ? d.abs : d.rel;
      const txt = usePp
        ? `${dv > 0 ? "+" : dv < 0 ? "−" : ""}${fmt(Math.abs(dv), "num")} poin`
        : `${dv > 0 ? "+" : dv < 0 ? "−" : ""}${fmt(Math.abs(dv), "num")}%`;
      const good = (dv > 0) === goodUp;
      const cls = dv === 0 ? "flat" : good ? "up" : "down";
      delta = `<span class="kpi-delta ${cls}">${deltaArrow(dv, txt)} <span class="yr">vs ${d.prevYear}</span></span>`;
    }
    kpiHtml += `<article class="kpi">
      <span class="kpi-label"><a href="#/indicator/${key}">${m.label}</a></span>
      <span class="kpi-value">${fmt(s.last[1], m.format)}</span>
      <span class="kpi-unit">${esc(m.unit)} · ${s.last[0]}</span>
      ${delta}
    </article>`;
  });
  kpiHtml += "</section>";

  const chips = ["gdpGrowth", "inflation", "unemployment", "exchangeRate", "exports", "gini"];
  const chipHtml = chips.map((k, i) =>
    `<label class="chip ${i < 3 ? "on" : ""}"><input type="checkbox" data-k="${k}" ${i < 3 ? "checked" : ""}>
      <span class="dot" style="background:${COLORS[i % COLORS.length]}"></span>${METAS[k].label}</label>`).join("");

  // grafik pertumbuhan penduduk: selisih antar tahun (juta jiwa)
  const pop = DATA.population;
  const growth = pop.slice(1).map(([y, v], i) => [y, (v - pop[i][1]) / 1e6]);

  const sectorCards = Object.entries(SECTORS).map(([s, label]) => {
    const items = ORDER.filter((k) => METAS[k].sector === s).map((k) => {
      const m = METAS[k], last = DATA[k].at(-1);
      return `<li><a href="#/indicator/${k}"><span>${m.label}</span><span class="v">${fmt(last[1], m.format)}<span class="u">${esc(m.unit)}</span></span></a></li>`;
    }).join("");
    return `<article class="card sector-card">
      <header><h3>${label}</h3><a href="#/table?s=${s}">Lihat ${items ? ORDER.filter((k) => METAS[k].sector === s).length : 0} indikator →</a></header>
      <ul>${items}</ul>
    </article>`;
  }).join("");

  app.innerHTML = `
  <h1>Ringkasan Nasional <span style="color:var(--ink-faint);font-weight:400">· Indonesia 1996–2025</span></h1>
  <p style="max-width:820px;color:var(--ink-soft)">Dua puluh delapan indikator resmi Indonesia selama tiga dekade, satu sumber:
     World Bank Open Data (diunduh <span style="white-space:nowrap">2026-11-26</span>). Semua angka di bawah diambil langsung dari berkas data situs ini —
     tidak ada permintaan jaringan saat halaman dibuka.</p>
  ${kpiHtml}

  <div class="section-title" id="makro"><h2>Perekonomian makro — grafik interaktif</h2>
    <span class="hint">centang / lepas indikator untuk membandingkan · arahkan kursor untuk nilai per tahun</span></div>
  <section class="card">
    <div class="chips" id="macroChips" role="group" aria-label="Pilih indikator untuk grafik">${chipHtml}</div>
    <div id="macroChart"></div>
    <p class="chart-note" id="macroNote"></p>
  </section>

  <div class="two-col" style="margin-top:16px">
    <section class="card">
      <h2>Tambahan penduduk per tahun</h2>
      <p style="font-size:13px;color:var(--ink-soft)">Selisih jumlah penduduk antar tahun, dalam juta jiwa. Laju tambahan menurun
      terus sejak puncak ±3,3 juta pada awal 1990-an akhir.</p>
      <div id="growthChart"></div>
    </section>
    <section class="card">
      <h2>Transformasi sosial</h2>
      <p style="font-size:13px;color:var(--ink-soft)">Persentase penduduk: perkotaan, berlistrik, dan pengguna internet bergerak
      pada satuan yang sama sehingga dapat dibaca langsung.</p>
      <div id="socialChart"></div>
    </section>
  </div>

  <div class="section-title"><h2>Sektor</h2><span class="hint">empat kelompok indikator — klik untuk membuka daftar terfilter di database</span></div>
  <section class="sector-grid">${sectorCards}</section>
  `;

  // ----- grafik makro interaktif dengan chip -----
  const host = document.getElementById("macroChart");
  const note = document.getElementById("macroNote");
  const dim = (u) => (u.startsWith("%") || u.startsWith("skala") ? "persen" : u); // % angkatan kerja, % PDB, skala 0–100 → satu dimensi baca
  function selected() {
    return [...host.closest("section").querySelectorAll("#macroChips input:checked")].map((i) => i.dataset.k);
  }
  function drawMacro() {
    const keys = selected();
    document.querySelectorAll("#macroChips .chip").forEach((c) => {
      c.classList.toggle("on", c.querySelector("input").checked);
    });
    if (keys.length === 0) {
      host.innerHTML = `<p style="color:var(--ink-faint);padding:20px 0">Pilih minimal satu indikator di atas.</p>`;
      note.textContent = "";
      return;
    }
    const dims = new Set(keys.map((k) => dim(METAS[k].unit)));
    const indexed = dims.size > 1;
    const series = keys.map((k) => ({
      key: k, label: METAS[k].label, format: METAS[k].format,
      color: COLORS[chips.indexOf(k) % COLORS.length], data: DATA[k],
    }));
    lineChart(host, {
      series, indexed, height: 300,
      aria: indexed ? "Grafik indeks, 1996 = 100" : "Grafik indikator terpilih",
    });
    note.textContent = indexed
      ? "Satuan indikator berbeda-beda, maka nilai dinormalkan ke indeks 1996 = 100; tooltip tetap menampilkan nilai asli."
      : "Satuan: persen (%). Lonjakan 1998 pada garis inflasi dan palung pada pertumbuhan PDB merekam krisis moneter.";
  }
  document.getElementById("macroChips").addEventListener("change", drawMacro);
  drawMacro();

  barChart(document.getElementById("growthChart"), {
    data: growth, format: "num", color: "#1c3f6e", height: 250,
    label: "Tambahan penduduk", aria: "Batang tambahan penduduk per tahun, juta jiwa",
  });
  document.getElementById("growthChart").insertAdjacentHTML("beforeend",
    '<p class="chart-note">Satuan: juta jiwa. Arahkan kursor ke batang untuk nilai persis.</p>');

  lineChart(document.getElementById("socialChart"), {
    height: 250,
    series: ["urbanPop", "electricAccess", "internetUsers"].map((k, i) => ({
      key: k, label: METAS[k].label, format: METAS[k].format, color: COLORS[(i + 1) % COLORS.length], data: DATA[k],
    })),
    aria: "Garis persentase penduduk perkotaan, akses listrik, pengguna internet",
  });
  document.getElementById("socialChart").insertAdjacentHTML("beforeend",
    `<div class="legend">${["urbanPop", "electricAccess", "internetUsers"].map((k, i) =>
      `<span><span class="sw" style="background:${COLORS[(i + 1) % COLORS.length]}"></span>${METAS[k].label} (${fmt(DATA[k].at(-1)[1], "pct")})</span>`).join("")}</div>`);
}

// ---------- #/indicator/<key> ----------
export function indicator(app, key) {
  const m = METAS[key], s = seriesStats(key), d = yoy(key);
  const idx = ORDER.indexOf(key);
  const prev = ORDER[(idx - 1 + ORDER.length) % ORDER.length];
  const next = ORDER[(idx + 1) % ORDER.length];

  const stat = (lab, val, sub) => `<div class="stat"><div class="lab">${lab}</div><div class="val">${val}</div><div class="sub">${sub || ""}</div></div>`;
  const statsHtml = `<section class="stat-row">
    ${stat("Terkini", fmt(s.last[1], m.format), s.last[0] + (d ? ` · ${d.abs > 0 ? "+" : d.abs < 0 ? "−" : ""}${fmt(Math.abs(d.abs), m.format === "pct" ? "num" : m.format)} vs ${d.prevYear}` : ""))}
    ${stat("Minimum", fmt(s.min[1], m.format), `tahun ${s.min[0]}`)}
    ${stat("Maksimum", fmt(s.max[1], m.format), `tahun ${s.max[0]}`)}
    ${stat("Rata-rata", fmt(s.avg, m.format), `${s.n} tahun tercatat`)}
    ${stat("CAGR", s.cagr == null ? "—" : `${(s.cagr * 100 >= 0 ? "+" : "−")}${fmt(Math.abs(s.cagr * 100), "num")}/th`, `sejak ${s.first[0]}`)}
  </section>`;

  const relHtml = m.related.map((rk) => {
    const rm = METAS[rk], rs = seriesStats(rk);
    return `<article class="card rel-card">
      <div class="rel-head"><a href="#/indicator/${rk}">${rm.label}</a><span class="rel-v">${fmt(rs.last[1], rm.format)}</span></div>
      ${sparkSvg(DATA[rk], COLORS[ORDER.indexOf(rk) % COLORS.length], 220, 44)}
      <div class="chart-note">${rs.first[0]}–${rs.last[0]} · ${esc(rm.unit)}</div>
    </article>`;
  }).join("");

  app.innerHTML = `
  <p class="crumb"><a href="#/">Beranda</a> · <a href="#/table?s=${m.sector}">${SECTORS[m.sector]}</a> · ${m.label}</p>
  <h1>${m.label} <span style="color:var(--ink-faint);font-weight:400;font-size:.65em">${esc(m.unit)}</span></h1>
  <p style="max-width:820px;color:var(--ink-soft)">${esc(m.desc)}</p>
  ${statsHtml}
  <section class="card">
    <div class="section-title" style="margin-top:0"><h2>Deret waktu ${s.first[0]}–${s.last[0]}</h2>
      <span class="hint">kursor untuk nilai per tahun · klik grafik lalu ←/→ untuk navigasi papan tik</span></div>
    <div id="mainChart"></div>
  </section>
  <div class="section-title"><h2>Perbandingan terkait</h2><span class="hint">dua indikator yang paling sering dibaca bersama ${m.label.toLowerCase()}</span></div>
  <section class="rel-grid">${relHtml}</section>
  <div class="section-title"><h2>Tabel tahun</h2><span class="hint">klik judul kolom untuk mengubah urutan</span></div>
  <section class="card" style="padding:0;overflow:hidden"><div id="yearTable"></div></section>
  <nav class="pager" aria-label="Indikator sebelumnya dan berikutnya">
    <a href="#/indicator/${prev}">← ${METAS[prev].label}</a>
    <a class="next" href="#/indicator/${next}">${METAS[next].label} →</a>
  </nav>`;

  lineChart(document.getElementById("mainChart"), {
    height: 340,
    series: [{ key, label: m.label, format: m.format, color: COLORS[0], data: DATA[key] }],
    aria: `Grafik ${m.label} per tahun`,
  });

  renderYearTable(document.getElementById("yearTable"), key);
}

// tabel tahun yang dapat diurut — dipakai juga oleh tampilan detail
export function renderYearTable(host, key) {
  const m = METAS[key];
  const rows = DATA[key];
  let sortCol = 0, sortAsc = true; // kolom 0 = tahun
  const body = () => {
    const withYoy = rows.map(([y, v], i) => {
      const p = rows[i - 1];
      return [y, v, p && v != null && p[1] != null ? v - p[1] : null];
    });
    withYoy.sort((a, b) => {
      const va = a[sortCol], vb = b[sortCol];
      const na = va == null, nb = vb == null;
      if (na || nb) return na && nb ? 0 : na ? 1 : -1;
      return (va < vb ? -1 : va > vb ? 1 : 0) * (sortAsc ? 1 : -1);
    });
    return withYoy.map(([y, v, dy]) =>
      `<tr><td>${y}</td><td>${fmt(v, m.format)}</td><td class="${dy == null ? "" : dy > 0 ? "pos" : dy < 0 ? "neg" : ""}">${
        dy == null ? "–" : (dy > 0 ? "+" : dy < 0 ? "−" : "") + fmt(Math.abs(dy), m.format === "pct" ? "num" : m.format)}</td></tr>`).join("");
  };
  const paint = () => {
    host.innerHTML = `<table class="ytable"><thead><tr>
      <th data-c="0" aria-sort="${sortCol === 0 ? (sortAsc ? "ascending" : "descending") : "none"}">Tahun ${sortCol === 0 ? (sortAsc ? "▲" : "▼") : ""}</th>
      <th data-c="1" aria-sort="${sortCol === 1 ? (sortAsc ? "ascending" : "descending") : "none"}">${esc(m.label)} ${sortCol === 1 ? (sortAsc ? "▲" : "▼") : ""}</th>
      <th data-c="2">Perubahan vs tahun sebelumnya</th>
    </tr></thead><tbody>${body()}</tbody></table>`;
  };
  host.addEventListener("click", (e) => {
    const th = e.target.closest("th");
    if (!th || th.dataset.c == null || th.dataset.c === "2") return;
    const c = Number(th.dataset.c);
    if (c === sortCol) sortAsc = !sortAsc; else { sortCol = c; sortAsc = c === 0; }
    paint();
  });
  paint();
}

// ---------- #/about ----------
const WB_CODES = {
  population: "SP.POP.TOTL", gdp: "NY.GDP.MKTP.CD", gdpPerCapita: "NY.GDP.PCAP.CD",
  gdpGrowth: "NY.GDP.MKTP.KD.ZG", inflation: "FP.CPI.TOTL.ZG", unemployment: "SL.UEM.TOTL.ZS",
  laborParticipation: "SL.TLF.CACT.ZS", exports: "NE.EXP.GNFS.CD", imports: "NE.IMP.GNFS.CD",
  fdi: "BX.KLT.DINV.CD.WD", gini: "SI.POV.GINI", lifeExpectancy: "SP.DYN.LE00.IN",
  infantMortality: "SP.DYN.IMRT.IN", crudeBirth: "SP.DYN.CB.IN", urbanPop: "SP.URB.TOTL.IN.ZS",
  fertility: "SP.DYN.TFRT.IN", electricAccess: "EG.ELC.ACCS.ZS", co2: "EN.GHG.CO2.MT.CE.AR5",
  educationSpend: "SE.XPD.TOTL.GB.ZS", primaryCompletion: "SE.PRM.CMPT.ZS", tertiaryEnrol: "SE.TER.ENRR.ZS",
  physiciansPer1k: "SH.MED.PHYS.ZS", undernourish: "SN.ITK.DEFC.ZS", internetUsers: "IT.NET.USER.ZS",
  mobileSubs: "IT.CEL.SETS.P2", exchangeRate: "PA.NUS.FCRF", povertyNat: "SI.POV.NAHC", healthSpend: "SH.XPD.CHEX.GD.ZS",
};

export function about(app) {
  const glossRows = ORDER.map((k) => {
    const m = METAS[k], s = seriesStats(k);
    return `<tr><td class="k"><a href="#/indicator/${k}">${m.label}</a></td><td><code>${WB_CODES[k]}</code></td>
      <td>${esc(m.unit)}</td><td>${s.first[0]}–${s.last[0]} (${s.n} titik)</td><td>${esc(m.desc)}</td></tr>`;
  }).join("");

  app.innerHTML = `
  <p class="crumb"><a href="#/">Beranda</a> · Tentang &amp; metodologi</p>
  <h1>Tentang &amp; Metodologi</h1>
  <div class="prose">
    <h2>Apa portal ini</h2>
    <p><strong>Barometer Nusantara</strong> adalah portal statistik Indonesia yang sepenuhnya statis: 28 indikator
    nasional periode 1996–2025, satu grafik interaktif per indikator, database matriks lengkap dengan penyaring
    tahun, pencarian, pengurutan kolom, dan unduhan CSV. Tidak ada pustaka pihak ketiga, tidak ada pelacak,
    dan tidak ada satu pun permintaan jaringan saat situs berjalan — muatlah dari disk dan semuanya tetap bekerja.</p>

    <h2>Sumber data</h2>
    <div class="callout">Seluruh angka berasal dari <strong>World Bank Open Data API v2</strong>
    (<code>api.worldbank.org/v2/country/IDN/indicator/&lt;kode&gt;?format=json&amp;date=1996:2025</code>),
    dieksekusi sekali pada <strong>26 November 2026</strong> dan hasilnya dibekukan ke dalam
    <code>app/data.js</code> apa adanya. Nilai tidak dibulatkan di lapisan data; pembulatan hanya terjadi saat
    ditampilkan, sehingga setiap angka di layar dapat ditelusuri balik ke sumbernya.</div>
    <p>Indikator dipilih dari rangkaian waktu Bank Dunia untuk Indonesia; beberapa seri (mis. harapan hidup,
    kematian bayi, angka fertilitas) berakhir pada 2024 karena tahun terakhir belum dipublikasikan saat unduhan
    dilakukan — rentang tiap seri tercantum pada glosarium di bawah dan sel kosong ditandai “–”, bukan nol.</p>

    <h2>Cara angka diolah</h2>
    <ul>
      <li><strong>Turunan</strong> dihitung di peramban dari data mentah: perubahan tahun-ke-tahun (selisih absolut,
      atau poin persentase untuk indikator %), CAGR = (akhir/awal)<sup>1/(jumlah tahun)</sup> − 1 bila kedua ujungnya positif.</li>
      <li><strong>Normalisasi grafik</strong>: bila satu grafik memuat indikator bersatuan berbeda, nilai diindeks ke
      1996 = 100 agar bentuk kurva dapat dibandingkan; tooltip selalu memberi nilai aslinya.</li>
      <li><strong>CSV</strong> disusun langsung dari baris yang tampak di layar (hasil pencarian, filter sektor, dan
      rentang tahun), dengan desimal bergaya internasional (tanda titik) agar terbaca perangkat lunak apa pun.</li>
    </ul>

    <h2>Glosarium ${ORDER.length} indikator</h2>
    <div class="table-scroll"><table class="glossary"><thead><tr>
      <th>Indikator</th><th>Kode Bank Dunia</th><th>Satuan</th><th>Cakupan</th><th>Keterangan</th>
    </tr></thead><tbody>${glossRows}</tbody></table></div>

    <h2>Catatan penggunaan</h2>
    <p>Angka boleh dikutip dan dibagi ulang tanpa izin; sumbernya cukup dicantumkan sebagai
    <em>World Bank Open Data, diunduh 2026-11-26</em>. Portal ini disusun untuk kompetisi make.fun
    “best-national-statistics-site” dan bukan produk resmi lembaga statistik mana pun.</p>
  </div>`;
}
