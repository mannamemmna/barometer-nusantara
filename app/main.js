// main.js — router hash, bilah sisi, dan tata letak aplikasi.
// Rute: #/ (ringkasan nasional) · #/indicator/<key> · #/table[?s=sektor] · #/about
import { DATA, METAS, ORDER, SECTORS } from "./data.js";
import { fmt } from "./charts.js";
import { home, indicator, about } from "./views.js";
import { database } from "./table.js";

const app = document.getElementById("app");

function parseHash() {
  const raw = location.hash.replace(/^#/, "") || "/";
  const [pathPart, queryPart = ""] = raw.split("?");
  const params = new URLSearchParams(queryPart);
  const segs = pathPart.split("/").filter(Boolean);
  if (segs.length === 0) return { name: "home", params };
  if (segs[0] === "indicator" && segs[1] && METAS[segs[1]]) return { name: "indicator", key: segs[1], params };
  if (segs[0] === "table") return { name: "table", params };
  if (segs[0] === "about") return { name: "about", params };
  return { name: "404", params };
}

function render() {
  const route = parseHash();
  window.scrollTo(0, 0);
  document.querySelectorAll(".mainnav a").forEach((a) => a.classList.remove("active"));
  document.querySelectorAll("#sideList a").forEach((a) => a.classList.remove("active"));

  if (route.name === "home") {
    document.title = "Barometer Nusantara — Statistik Nasional Indonesia 1996–2025";
    document.querySelector('[data-nav=home]').classList.add("active");
    home(app);
  } else if (route.name === "indicator") {
    document.title = `${METAS[route.key].label} · Barometer Nusantara`;
    document.querySelector('[data-nav=home]').classList.add("active");
    const link = document.querySelector(`#sideList a[href="#/indicator/${route.key}"]`);
    if (link) link.classList.add("active");
    indicator(app, route.key);
  } else if (route.name === "table") {
    document.title = "Database indikator · Barometer Nusantara";
    document.querySelector('[data-nav=table]').classList.add("active");
    database(app, route.params);
  } else if (route.name === "about") {
    document.title = "Tentang & metodologi · Barometer Nusantara";
    document.querySelector('[data-nav=about]').classList.add("active");
    about(app);
  } else {
    document.title = "Halaman tidak ditemukan · Barometer Nusantara";
    app.innerHTML = `<h1>404 — Halaman tidak ditemukan</h1>
      <p>Alamat <code>${location.hash.replace(/[<>&"]/g, "")}</code> bukan rute yang dikenal portal ini.</p>
      <p><a href="#/">Kembali ke ringkasan nasional</a> · <a href="#/table">Buka database indikator</a></p>`;
  }
}

window.addEventListener("hashchange", render);

// ---------- bilah sisi: indeks 28 indikator per sektor ----------
function buildSidebar() {
  const list = document.getElementById("sideList");
  const groups = {};
  ORDER.forEach((k) => {
    const s = METAS[k].sector;
    (groups[s] = groups[s] || []).push(k);
  });
  let html = "";
  Object.keys(SECTORS).forEach((s) => {
    if (!groups[s]) return;
    html += `<h4>${SECTORS[s]}</h4>`;
    groups[s].forEach((k) => {
      const m = METAS[k];
      const last = DATA[k].at(-1)[1];
      html += `<a href="#/indicator/${k}" data-k="${k}"><span>${m.label}</span><span class="lat">${fmt(last, m.format)}</span></a>`;
    });
  });
  list.innerHTML = html;
  document.getElementById("sideFilter").addEventListener("input", (e) => {
    const q = e.target.value.trim().toLowerCase();
    list.querySelectorAll("a").forEach((a) => {
      const k = a.dataset.k;
      const hay = `${METAS[k].label} ${k} ${METAS[k].unit} ${METAS[k].desc}`.toLowerCase();
      a.style.display = !q || hay.includes(q) ? "" : "none";
    });
    list.querySelectorAll("h4").forEach((h) => {
      let el = h.nextElementSibling, any = false;
      while (el && el.tagName !== "H4") { if (el.tagName === "A" && el.style.display !== "none") any = true; el = el.nextElementSibling; }
      h.style.display = any || !q ? "" : "none";
    });
  });
  const toggle = document.getElementById("navToggle");
  toggle.addEventListener("click", () => {
    const open = document.getElementById("sideIndex").classList.toggle("open");
    toggle.setAttribute("aria-expanded", String(open));
    toggle.textContent = open ? "Indikator ▴" : "Indikator ▾";
  });
}

buildSidebar();
render();
