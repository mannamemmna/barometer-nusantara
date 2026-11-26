// charts.js — grafik SVG buatan sendiri: tanpa pustaka eksternal, tanpa canvas, tanpa jaringan.
// Semua gambar memakai viewBox yang diskalakan ulang lewat ResizeObserver sehingga teks tetap
// terbaca di ponsel. Interaktivitas: crosshair + tooltip pada pointermove, navigasi papan tik
// (←/→, Home, End, Esc) pada sumbu fokus SVG.

const COLORS = ["#b5121b", "#1c3f6e", "#0e6b64", "#9a6b00", "#5b3a8e", "#356b28"];

// ---------- pemformatan angka (gaya Indonesia: titik ribuan, koma desimal) ----------
const nf = (min, max) => new Intl.NumberFormat("id-ID", { minimumFractionDigits: min, maximumFractionDigits: max ?? min });

export function fmtTick(v) {
  const a = Math.abs(v);
  if (a >= 1e12) return (v / 1e12).toFixed(2).replace(".", ",") + " T";
  if (a >= 1e9) return (v / 1e9).toFixed(1).replace(".", ",") + " Mr";
  if (a >= 1e6) return (v / 1e6).toFixed(1).replace(".", ",") + " jt";
  if (a >= 1000) return nf(0).format(Math.round(v));
  if (a >= 10) return nf(0, 1).format(v);
  return nf(0, 2).format(v);
}

// Nilai lengkap sesuai format METAS (tanpa satuan; satuan ditempel pemanggil bila perlu).
export function fmt(v, format) {
  if (v == null || Number.isNaN(v)) return "–";
  switch (format) {
    case "int": return nf(0).format(Math.round(v));
    case "num": return nf(0, 2).format(v);
    case "pct": return nf(1, 1).format(v) + "%";
    case "usd": return "US$ " + nf(0).format(v);
    case "idr": return "Rp " + nf(0).format(Math.round(v));
    case "big": case "ton": {
      const suf = format === "big" ? "US$ " : "";
      const unit = format === "big" ? "" : " ton";
      const a = Math.abs(v);
      if (a >= 1e12) return suf + nf(2, 2).format(v / 1e12) + " triliun" + unit;
      if (a >= 1e9) return suf + nf(1, 1).format(v / 1e9) + " miliar" + unit;
      if (a >= 1e6) return suf + nf(1, 1).format(v / 1e6) + " juta" + unit;
      return suf + nf(0).format(v) + unit;
    }
    default: return nf(0, 2).format(v);
  }
}

// ---------- skala ----------
function niceTicks(min, max, count) {
  if (min === max) { min -= 1; max += 1; }
  const span = max - min;
  const step0 = span / Math.max(1, count);
  const mag = Math.pow(10, Math.floor(Math.log10(step0)));
  const norm = step0 / mag;
  const step = (norm >= 5 ? 10 : norm >= 2 ? 5 : norm >= 1 ? 2 : 1) * mag;
  const lo = Math.floor(min / step) * step;
  const hi = Math.ceil(max / step) * step;
  const ticks = [];
  for (let v = lo; v <= hi + step / 2; v += step) ticks.push(Math.round(v * 1e9) / 1e9);
  return { lo, hi, ticks };
}

const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

// ---------- grafik garis multi-seri ----------
// opts: { series: [{key,label,color,format,data:[[year,v],…]}], height, indexed, note }
// indexed=true menormalkan tiap seri ke 1996=100 agar satuan berbeda dapat dibandingkan.
export function lineChart(host, opts) {
  host.classList.add("chart-wrap");
  host.innerHTML = '<div class="chart-tip" role="status" aria-live="polite"></div>';
  const tip = host.querySelector(".chart-tip");
  const H = opts.height ?? 330;
  let focusIdx = null, geom = null;

  function seriesValues(s) {
    if (!opts.indexed) return s.data.map(([y, v]) => [y, v]);
    const base = s.data.find(([, v]) => v != null && v !== 0);
    if (!base) return s.data.map(([y]) => [y, null]);
    return s.data.map(([y, v]) => [y, v == null ? null : (v / base[1]) * 100]);
  }

  function draw() {
    const w = Math.max(320, host.clientWidth || 760);
    const pad = { t: 14, r: 16, b: 30, l: w < 520 ? 46 : 62 };
    const all = opts.series.map((s) => ({ ...s, pts: seriesValues(s) }));
    const years = new Set();
    all.forEach((s) => s.pts.forEach(([y]) => years.add(y)));
    const yMin = Math.min(...years), yMax = Math.max(...years);
    const vals = all.flatMap((s) => s.pts.map(([, v]) => v)).filter((v) => v != null);
    let lo = Math.min(0, ...vals), hi = Math.max(...vals);
    if (opts.indexed) { lo = Math.min(lo, 100); hi = Math.max(hi, 100); }
    const { lo: tLo, hi: tHi, ticks } = niceTicks(lo, hi, 5);
    const X = (y) => pad.l + ((y - yMin) / (yMax - yMin || 1)) * (w - pad.l - pad.r);
    const Y = (v) => pad.t + (1 - (v - tLo) / (tHi - tLo || 1)) * (H - pad.t - pad.b);
    geom = { X, Y, yMin, yMax, all, w, pad, H };

    const stepY = yMax - yMin > 16 ? 5 : yMax - yMin > 8 ? 2 : 1;
    let g = "";
    ticks.forEach((t) => {
      g += `<line x1="${pad.l}" x2="${w - pad.r}" y1="${Y(t).toFixed(1)}" y2="${Y(t).toFixed(1)}" stroke="${t === 0 ? "#9a958d" : "#e6e2dc"}" stroke-width="${t === 0 ? 1.4 : 1}"/>`;
      g += `<text x="${pad.l - 7}" y="${(Y(t) + 3.5).toFixed(1)}" text-anchor="end" font-size="11" fill="#5d626a">${esc(opts.indexed ? nf(0, 0).format(t) : fmtTick(t))}</text>`;
    });
    const labelYears = new Set([yMin, yMax]);
    for (let y = Math.ceil(yMin / stepY) * stepY; y <= yMax; y += stepY) labelYears.add(y);
    [...labelYears].sort((a, b) => a - b).forEach((y) => {
      g += `<text x="${X(y).toFixed(1)}" y="${H - 9}" text-anchor="middle" font-size="11" fill="#5d626a">${y}</text>`;
    });
    g += `<line x1="${pad.l}" x2="${w - pad.r}" y1="${Y(tLo)}" y2="${Y(tLo)}" stroke="#b9b4ac"/>`;

    all.forEach((s) => {
      const pts = s.pts.filter(([, v]) => v != null).map(([y, v]) => `${X(y).toFixed(1)},${Y(v).toFixed(1)}`).join(" ");
      g += `<polyline points="${pts}" fill="none" stroke="${s.color}" stroke-width="2.4" stroke-linejoin="round" stroke-linecap="round"/>`;
      s.pts.forEach(([y, v]) => {
        if (v != null) g += `<circle cx="${X(y).toFixed(1)}" cy="${Y(v).toFixed(1)}" r="2.6" fill="${s.color}" opacity=".55"/>`;
      });
    });

    g += `<g id="cross" style="display:none"><line y1="${pad.t}" y2="${H - pad.b}" stroke="#1b1d20" stroke-width="1" stroke-dasharray="3 3"/>`;
    all.forEach((s) => { g += `<circle r="4.5" fill="${s.color}" stroke="#fff" stroke-width="1.6" class="cdot"/>`; });
    g += `</g>`;
    g += `<rect class="hitzone" x="${pad.l}" y="${pad.t}" width="${Math.max(1, w - pad.l - pad.r)}" height="${H - pad.t - pad.b}" fill="transparent"/>`;

    const prev = host.querySelector("svg");
    host.insertAdjacentHTML("afterbegin",
      `<svg viewBox="0 0 ${w} ${H}" role="img" tabindex="0" aria-label="${esc(opts.aria || "Grafik garis")}" style="font-family:inherit">${g}</svg>`);
    if (prev) prev.remove();
    renderFocus();
  }

  function renderFocus() {
    const svg = host.querySelector("svg");
    if (!svg || !geom) return;
    const cross = svg.querySelector("#cross");
    if (focusIdx == null) { cross.style.display = "none"; tip.style.display = "none"; return; }
    const year = geom.yMin + focusIdx;
    if (year > geom.yMax) { cross.style.display = "none"; tip.style.display = "none"; return; }
    const x = geom.X(year);
    cross.style.display = "";
    cross.querySelector("line").setAttribute("x1", x); cross.querySelector("line").setAttribute("x2", x);
    const dots = cross.querySelectorAll(".cdot");
    let rows = `<div class="tip-year">Tahun ${year}</div>`;
    geom.all.forEach((s, i) => {
      const hit = s.pts.find(([yy]) => yy === year);
      const dot = dots[i];
      if (!hit || hit[1] == null) { dot.setAttribute("opacity", "0"); return; }
      dot.setAttribute("opacity", "1");
      dot.setAttribute("cx", x); dot.setAttribute("cy", geom.Y(hit[1]));
      const raw = s.data.find(([yy]) => yy === year);
      const valTxt = opts.indexed
        ? `${nf(1, 1).format(hit[1])} (indeks) — ${esc(fmt(raw ? raw[1] : null, s.format))}`
        : esc(fmt(hit[1], s.format));
      rows += `<div><span class="sw" style="background:${s.color}"></span>${esc(s.label)}: <strong>${valTxt}</strong></div>`;
    });
    tip.innerHTML = rows;
    tip.style.display = "block";
    const tw = tip.offsetWidth;
    let left = x + 14;
    if (left + tw > geom.w - 4) left = x - tw - 14;
    tip.style.left = Math.max(2, left) + "px";
    tip.style.top = (geom.pad.t + 6) + "px";
  }

  function setFocusFromClientX(clientX) {
    if (!geom) return;
    const rect = host.querySelector("svg").getBoundingClientRect();
    const scale = rect.width / geom.w;
    const px = (clientX - rect.left) / scale;
    const frac = (px - geom.pad.l) / (geom.w - geom.pad.l - geom.pad.r);
    const idx = Math.round(frac * (geom.yMax - geom.yMin));
    focusIdx = Math.max(0, Math.min(geom.yMax - geom.yMin, idx));
    renderFocus();
  }

  host.addEventListener("pointermove", (e) => setFocusFromClientX(e.clientX));
  host.addEventListener("pointerleave", () => { focusIdx = null; renderFocus(); });
  host.addEventListener("keydown", (e) => {
    const span = geom ? geom.yMax - geom.yMin : 0;
    if (e.key === "ArrowRight") { focusIdx = Math.min(span, (focusIdx ?? -1) + 1); renderFocus(); e.preventDefault(); }
    else if (e.key === "ArrowLeft") { focusIdx = Math.max(0, (focusIdx ?? span + 1) - 1); renderFocus(); e.preventDefault(); }
    else if (e.key === "Home") { focusIdx = 0; renderFocus(); e.preventDefault(); }
    else if (e.key === "End") { focusIdx = span; renderFocus(); e.preventDefault(); }
    else if (e.key === "Escape") { focusIdx = null; renderFocus(); }
  });
  // fokus keyboard masuk ke svg, bukan host
  host.addEventListener("focusin", (e) => { if (e.target.tagName === "svg" && focusIdx == null) { focusIdx = 0; renderFocus(); } });

  draw();
  const ro = new ResizeObserver(() => draw());
  ro.observe(host);
  return { redraw: draw };
}

// ---------- small multiples: satu mini-chart per seri, sumbu-Y sendiri ----------
// Menghindari masalah grafik gabungan ternormalisasi: lonjakan besar satu seri tidak
// menghimpit seri lain karena tiap panel memakai skalanya sendiri.
// s: {label, color, format, data:[[year,v],…], href, valueLabel, deltaLabel, deltaCls, aria}
export function smallMultiples(host, series) {
  host.classList.add("mini-grid");
  host.innerHTML = series.map((s) => `
    <figure class="mini">
      <figcaption class="mini-head">
        <span class="mini-name"><span class="dot" style="background:${s.color}"></span>${
          s.href ? `<a href="${s.href}">${esc(s.label)}</a>` : esc(s.label)}</span>
        <span class="mini-latest">${esc(s.valueLabel ?? "")}<span class="mini-delta ${s.deltaCls || "flat"}">${esc(s.deltaLabel || "")}</span></span>
      </figcaption>
      <div class="mini-chart"></div>
    </figure>`).join("");
  host.querySelectorAll(".mini-chart").forEach((el, i) => miniChart(el, series[i]));
}

function miniChart(host, s) {
  host.classList.add("chart-wrap");
  host.innerHTML = '<div class="chart-tip" role="status" aria-live="polite"></div>';
  const tip = host.querySelector(".chart-tip");
  const H = 170;
  let focusIdx = null, geom = null;

  function draw() {
    const w = Math.max(220, host.clientWidth || 320);
    const pad = { t: 10, r: 12, b: 22, l: 46 };
    const years = s.data.map(([y]) => y);
    const yMin = Math.min(...years), yMax = Math.max(...years);
    const vals = s.data.map(([, v]) => v).filter((v) => v != null);
    const { lo: tLo, hi: tHi, ticks } = niceTicks(Math.min(...vals), Math.max(...vals), 4);
    const X = (y) => pad.l + ((y - yMin) / (yMax - yMin || 1)) * (w - pad.l - pad.r);
    const Y = (v) => pad.t + (1 - (v - tLo) / (tHi - tLo || 1)) * (H - pad.t - pad.b);
    geom = { X, Y, yMin, yMax, w, pad, H };

    let g = "";
    ticks.forEach((t) => {
      g += `<line x1="${pad.l}" x2="${w - pad.r}" y1="${Y(t).toFixed(1)}" y2="${Y(t).toFixed(1)}" stroke="${t === 0 ? "#9a958d" : "#e6e2dc"}" stroke-width="${t === 0 ? 1.3 : 1}"/>`;
      g += `<text x="${pad.l - 6}" y="${(Y(t) + 3.5).toFixed(1)}" text-anchor="end" font-size="10.5" fill="#5d626a">${esc(fmtTick(t))}</text>`;
    });
    const mid = Math.round((yMin + yMax) / 2);
    [[yMin, "start"], [mid, "middle"], [yMax, "end"]].forEach(([y, anc]) => {
      g += `<text x="${X(y).toFixed(1)}" y="${H - 6}" text-anchor="${anc}" font-size="10.5" fill="#5d626a">${y}</text>`;
    });
    const ok = s.data.filter(([, v]) => v != null);
    g += `<polyline points="${ok.map(([y, v]) => `${X(y).toFixed(1)},${Y(v).toFixed(1)}`).join(" ")}" fill="none" stroke="${s.color}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>`;
    const last = ok.at(-1);
    if (last) g += `<circle cx="${X(last[0]).toFixed(1)}" cy="${Y(last[1]).toFixed(1)}" r="3" fill="${s.color}"/>`;
    g += `<g id="cross" style="display:none"><line y1="${pad.t}" y2="${H - pad.b}" stroke="#1b1d20" stroke-width="1" stroke-dasharray="3 3"/><circle r="4" fill="${s.color}" stroke="#fff" stroke-width="1.5"/></g>`;
    g += `<rect class="hitzone" x="${pad.l}" y="${pad.t}" width="${Math.max(1, w - pad.l - pad.r)}" height="${H - pad.t - pad.b}" fill="transparent"/>`;

    const prev = host.querySelector("svg");
    host.insertAdjacentHTML("afterbegin",
      `<svg viewBox="0 0 ${w} ${H}" role="img" tabindex="0" aria-label="${esc(s.aria || s.label)}" style="font-family:inherit">${g}</svg>`);
    if (prev) prev.remove();
    renderFocus();
  }

  function renderFocus() {
    const svg = host.querySelector("svg");
    if (!svg || !geom) return;
    const cross = svg.querySelector("#cross");
    if (focusIdx == null) { cross.style.display = "none"; tip.style.display = "none"; return; }
    const year = geom.yMin + focusIdx;
    if (year > geom.yMax) { cross.style.display = "none"; tip.style.display = "none"; return; }
    const x = geom.X(year);
    cross.style.display = "";
    cross.querySelector("line").setAttribute("x1", x); cross.querySelector("line").setAttribute("x2", x);
    const dot = cross.querySelector("circle");
    const hit = s.data.find(([yy]) => yy === year);
    if (!hit || hit[1] == null) dot.setAttribute("opacity", "0");
    else { dot.setAttribute("opacity", "1"); dot.setAttribute("cx", x); dot.setAttribute("cy", geom.Y(hit[1])); }
    tip.innerHTML = `<div class="tip-year">Tahun ${year}</div><span class="sw" style="background:${s.color}"></span>${esc(s.label)}: <strong>${esc(fmt(hit ? hit[1] : null, s.format))}</strong>`;
    tip.style.display = "block";
    const tw = tip.offsetWidth;
    let left = x + 12;
    if (left + tw > geom.w - 4) left = x - tw - 12;
    tip.style.left = Math.max(2, left) + "px";
    tip.style.top = (geom.pad.t + 4) + "px";
  }

  host.addEventListener("pointermove", (e) => {
    if (!geom) return;
    const rect = host.querySelector("svg").getBoundingClientRect();
    const px = (e.clientX - rect.left) * (geom.w / rect.width);
    const frac = (px - geom.pad.l) / (geom.w - geom.pad.l - geom.pad.r);
    focusIdx = Math.max(0, Math.min(geom.yMax - geom.yMin, Math.round(frac * (geom.yMax - geom.yMin))));
    renderFocus();
  });
  host.addEventListener("pointerleave", () => { focusIdx = null; renderFocus(); });
  host.addEventListener("keydown", (e) => {
    if (!geom) return;
    const span = geom.yMax - geom.yMin;
    if (e.key === "ArrowRight") { focusIdx = Math.min(span, (focusIdx ?? -1) + 1); renderFocus(); e.preventDefault(); }
    else if (e.key === "ArrowLeft") { focusIdx = Math.max(0, (focusIdx ?? span + 1) - 1); renderFocus(); e.preventDefault(); }
    else if (e.key === "Home") { focusIdx = 0; renderFocus(); e.preventDefault(); }
    else if (e.key === "End") { focusIdx = span; renderFocus(); e.preventDefault(); }
    else if (e.key === "Escape") { focusIdx = null; renderFocus(); }
  });
  host.addEventListener("focusin", (e) => { if (e.target.tagName === "svg" && focusIdx == null) { focusIdx = 0; renderFocus(); } });

  draw();
  new ResizeObserver(() => draw()).observe(host);
}

// ---------- grafik batang vertikal ----------
// opts: { data: [[year, v]], format, color, height, label, aria }
export function barChart(host, opts) {
  host.classList.add("chart-wrap");
  host.innerHTML = '<div class="chart-tip" role="status" aria-live="polite"></div>';
  const tip = host.querySelector(".chart-tip");
  const H = opts.height ?? 240;
  let geom = null;

  function draw() {
    const w = Math.max(320, host.clientWidth || 760);
    const pad = { t: 12, r: 12, b: 30, l: w < 520 ? 42 : 56 };
    const vals = opts.data.map(([, v]) => v).filter((v) => v != null);
    const lo = Math.min(0, ...vals), hi = Math.max(...vals);
    const { lo: tLo, hi: tHi, ticks } = niceTicks(lo, hi, 4);
    const n = opts.data.length;
    const bw = (w - pad.l - pad.r) / n;
    const Y = (v) => pad.t + (1 - (v - tLo) / (tHi - tLo || 1)) * (H - pad.t - pad.b);
    geom = { w, pad, H, bw, Y, n };
    let g = "";
    ticks.forEach((t) => {
      g += `<line x1="${pad.l}" x2="${w - pad.r}" y1="${Y(t).toFixed(1)}" y2="${Y(t).toFixed(1)}" stroke="${t === 0 ? "#9a958d" : "#e6e2dc"}" stroke-width="${t === 0 ? 1.4 : 1}"/>`;
      g += `<text x="${pad.l - 6}" y="${(Y(t) + 3.5).toFixed(1)}" text-anchor="end" font-size="11" fill="#5d626a">${esc(fmtTick(t))}</text>`;
    });
    opts.data.forEach(([y, v], i) => {
      if (v == null) return;
      const x = pad.l + i * bw + bw * 0.14;
      const yTop = v >= 0 ? Y(v) : Y(0);
      const h = Math.abs(Y(v) - Y(0));
      g += `<rect x="${x.toFixed(1)}" y="${yTop.toFixed(1)}" width="${(bw * 0.72).toFixed(1)}" height="${Math.max(1, h).toFixed(1)}" fill="${opts.color || COLORS[0]}" rx="1.5" data-i="${i}"/>`;
      if (i % 3 === 0 || i === n - 1) g += `<text x="${(pad.l + i * bw + bw / 2).toFixed(1)}" y="${H - 9}" text-anchor="middle" font-size="10.5" fill="#5d626a">${y}</text>`;
    });
    g += `<rect class="hitzone" x="${pad.l}" y="${pad.t}" width="${Math.max(1, w - pad.l - pad.r)}" height="${H - pad.t - pad.b}" fill="transparent"/>`;
    const prev = host.querySelector("svg");
    host.insertAdjacentHTML("afterbegin",
      `<svg viewBox="0 0 ${w} ${H}" role="img" aria-label="${esc(opts.aria || opts.label || "Grafik batang")}" style="font-family:inherit">${g}</svg>`);
    if (prev) prev.remove();
  }

  host.addEventListener("pointermove", (e) => {
    if (!geom) return;
    const svg = host.querySelector("svg");
    const rect = svg.getBoundingClientRect();
    const px = (e.clientX - rect.left) * (geom.w / rect.width);
    const py = (e.clientY - rect.top) * (geom.H / rect.height);
    const i = Math.floor((px - geom.pad.l) / geom.bw);
    if (i < 0 || i >= geom.n || py > geom.H - geom.pad.b) { tip.style.display = "none"; return; }
    const [year, v] = opts.data[i];
    if (v == null) { tip.style.display = "none"; return; }
    tip.innerHTML = `<div class="tip-year">Tahun ${year}</div>${esc(opts.label || "")}: <strong>${esc(fmt(v, opts.format))}</strong>`;
    tip.style.display = "block";
    const scale = rect.width / geom.w;
    let left = (geom.pad.l + i * geom.bw + geom.bw / 2) * scale + 10;
    if (left + tip.offsetWidth > geom.w * scale - 4) left -= tip.offsetWidth + 20;
    tip.style.left = Math.max(2, left) + "px";
    tip.style.top = "8px";
  });
  host.addEventListener("pointerleave", () => { tip.style.display = "none"; });

  draw();
  new ResizeObserver(draw).observe(host);
}

// ---------- sparkline (statis, ringan; mengembalikan markup svg) ----------
export function sparkSvg(data, color, w = 150, h = 34) {
  const pts = data.filter(([, v]) => v != null);
  if (pts.length < 2) return "";
  const xs = pts.map(([y]) => y);
  const vs = pts.map(([, v]) => v);
  const yMin = Math.min(...xs), yMax = Math.max(...xs);
  const lo = Math.min(...vs), hi = Math.max(...vs);
  const X = (y) => 2 + ((y - yMin) / (yMax - yMin || 1)) * (w - 4);
  const Y = (v) => h - 3 - ((v - lo) / (hi - lo || 1)) * (h - 6);
  const line = pts.map(([y, v]) => `${X(y).toFixed(1)},${Y(v).toFixed(1)}`).join(" ");
  const last = pts[pts.length - 1];
  return `<svg viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" aria-hidden="true" style="max-width:100%"><polyline points="${line}" fill="none" stroke="${color}" stroke-width="1.8"/><circle cx="${X(last[0]).toFixed(1)}" cy="${Y(last[1]).toFixed(1)}" r="2.4" fill="${color}"/></svg>`;
}

export { COLORS, esc, niceTicks };
