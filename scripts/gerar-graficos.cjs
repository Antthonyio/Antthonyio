#!/usr/bin/env node
/* ============================================================
   Gera assets/langs.svg e assets/heatmap.svg a partir da API
   do GitHub. Roda no Actions (GH_TOKEN é o token do repo) ou
   localmente:  GH_TOKEN=xxx node scripts/gerar-graficos.cjs
   ============================================================ */

const fs = require("fs");
const path = require("path");

const TOKEN = process.env.GH_TOKEN || "";
const LOGIN = process.env.GH_LOGIN || "Antthonyio";
const OUT = path.join(__dirname, "..", "assets");

const CORES = {
  bg: "#0b0910", surface: "#12101a", line: "#241f33",
  ink: "#f4f0fa", soft: "#b6adc8", mute: "#8b82a0",
  accent: "#b14aed", accent2: "#e83e8c"
};

// cores oficiais aproximadas do GitHub para as linguagens mais comuns
const LANG_CORES = {
  TypeScript: "#3178c6", JavaScript: "#f1e05a", Python: "#3572A5", Lua: "#000080",
  "C#": "#178600", HTML: "#e34c26", CSS: "#563d7c", Shell: "#89e051",
  Dockerfile: "#384d54", Vue: "#41b883", Go: "#00ADD8", Rust: "#dea584",
  Java: "#b07219", PHP: "#4F5D95", Ruby: "#701516", "C++": "#f34b7d",
  SCSS: "#c6538c", EJS: "#a91e50", Batchfile: "#C1F12E", PowerShell: "#012456"
};

const api = (p) => fetch(`https://api.github.com${p}`, {
  headers: {
    Accept: "application/vnd.github+json",
    "User-Agent": "perfil-graficos",
    ...(TOKEN ? { Authorization: `Bearer ${TOKEN}` } : {})
  }
});

const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

/* ---------------- Linguagens ---------------- */

async function repos() {
  const out = [];
  for (let page = 1; page <= 5; page++) {
    const res = await api(`/users/${LOGIN}/repos?per_page=100&page=${page}&sort=pushed`);
    if (!res.ok) break;
    const list = await res.json();
    if (!Array.isArray(list) || list.length === 0) break;
    out.push(...list);
  }
  return out;
}

async function linguagens(lista) {
  const bytes = {};
  for (const r of lista) {
    if (!r.size) continue;
    const res = await api(`/repos/${r.full_name}/languages`);
    if (!res.ok) continue;
    const langs = await res.json();
    for (const [k, v] of Object.entries(langs || {})) bytes[k] = (bytes[k] || 0) + v;
  }
  const total = Object.values(bytes).reduce((a, b) => a + b, 0) || 1;
  return Object.entries(bytes)
    .map(([nome, b]) => ({ nome, bytes: b, pct: (b / total) * 100, cor: LANG_CORES[nome] || "#b14aed" }))
    .sort((a, b) => b.bytes - a.bytes)
    .slice(0, 8);
}

function svgLangs(dados) {
  const W = 1200, H = 128;
  const barX = 40, barY = 34, barW = W - 80, barH = 14;
  let x = barX;
  const segs = dados.map((d) => {
    const w = Math.max((d.pct / 100) * barW, 2);
    const s = `<rect x="${x.toFixed(1)}" y="${barY}" width="${w.toFixed(1)}" height="${barH}" fill="${d.cor}"/>`;
    x += w;
    return s;
  }).join("");

  const legendas = dados.slice(0, 6).map((d, i) => {
    const lx = 40 + (i % 3) * 385;
    const ly = 84 + Math.floor(i / 3) * 26;
    return `<g transform="translate(${lx},${ly})">
      <circle cx="5" cy="-4" r="5" fill="${d.cor}"/>
      <text x="18" y="0" font-family="'JetBrains Mono',ui-monospace,monospace" font-size="12" fill="${CORES.soft}">${esc(d.nome)}</text>
      <text x="150" y="0" font-family="'JetBrains Mono',ui-monospace,monospace" font-size="12" fill="${CORES.mute}">${d.pct.toFixed(1)}%</text>
    </g>`;
  }).join("");

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" fill="none" role="img" aria-label="Distribuição de linguagens">
  <defs>
    <linearGradient id="l-bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="${CORES.surface}"/><stop offset="1" stop-color="${CORES.bg}"/>
    </linearGradient>
    <clipPath id="l-clip"><rect x="${barX}" y="${barY}" width="${barW}" height="${barH}" rx="7"/></clipPath>
  </defs>
  <rect width="${W}" height="${H}" rx="16" fill="url(#l-bg)" stroke="${CORES.line}" stroke-width="1.5"/>
  <text x="40" y="24" font-family="'JetBrains Mono',ui-monospace,monospace" font-size="10" letter-spacing="1.4" fill="${CORES.accent}">DISTRIBUIÇÃO POR BYTES DE CÓDIGO</text>
  <g clip-path="url(#l-clip)"><rect x="${barX}" y="${barY}" width="${barW}" height="${barH}" fill="${CORES.line}"/>${segs}</g>
  ${legendas}
</svg>
`;
}

/* ---------------- Contribuições (heatmap) ---------------- */

async function contribuicoes() {
  const q = `query($login:String!){
    user(login:$login){
      contributionsCollection{
        contributionCalendar{
          totalContributions
          weeks{ contributionDays{ contributionCount date } }
        }
      }
    }
  }`;
  const res = await fetch("https://api.github.com/graphql", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "User-Agent": "perfil-graficos",
      ...(TOKEN ? { Authorization: `Bearer ${TOKEN}` } : {})
    },
    body: JSON.stringify({ query: q, variables: { login: LOGIN } })
  });
  if (!res.ok) return null;
  const j = await res.json();
  return j?.data?.user?.contributionsCollection?.contributionCalendar || null;
}

function svgHeatmap(cal) {
  const semanas = cal ? cal.weeks : [];
  const total = cal ? cal.totalContributions : 0;

  const cell = 15, gap = 4, left = 46, top = 56;
  const cols = Math.max(semanas.length, 1);
  const W = 1200;
  const H = top + 7 * (cell + gap) + 34;
  const step = Math.min(cell + gap, (W - left - 24) / cols);
  const cw = step - gap;

  const niveis = ["#1b1727", "#3d2a5c", "#6a35a8", "#9c3fd4", "#e83e8c"];
  const nivel = (n) => n === 0 ? 0 : n <= 1 ? 1 : n <= 3 ? 2 : n <= 6 ? 3 : 4;

  let cells = "";
  semanas.forEach((sem, i) => {
    sem.contributionDays.forEach((d, j) => {
      const x = left + i * step;
      const y = top + j * step;
      cells += `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${cw.toFixed(1)}" height="${cw.toFixed(1)}" rx="3" fill="${niveis[nivel(d.contributionCount)]}"><title>${d.date}: ${d.contributionCount}</title></rect>`;
    });
  });

  const meses = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
  let labels = "";
  let ultimoMes = -1;
  semanas.forEach((sem, i) => {
    const d = new Date(sem.contributionDays[0].date + "T12:00:00Z");
    if (d.getMonth() !== ultimoMes) {
      ultimoMes = d.getMonth();
      labels += `<text x="${(left + i * step).toFixed(1)}" y="${top - 10}" font-family="'JetBrains Mono',ui-monospace,monospace" font-size="10" fill="${CORES.mute}">${meses[d.getMonth()]}</text>`;
    }
  });

  const dias = ["seg", "", "qua", "", "sex", "", "dom"];
  const rotulosDias = dias.map((d, j) => d
    ? `<text x="10" y="${(top + j * step + cw * 0.75).toFixed(1)}" font-family="'JetBrains Mono',ui-monospace,monospace" font-size="9.5" fill="${CORES.mute}">${d}</text>`
    : "").join("");

  const legenda = niveis.map((c, i) =>
    `<rect x="${W - 24 - (4 - i) * 19}" y="${H - 26}" width="13" height="13" rx="3" fill="${c}"/>`).join("");

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" fill="none" role="img" aria-label="Contribuições no último ano: ${total}">
  <defs>
    <linearGradient id="h-bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="${CORES.surface}"/><stop offset="1" stop-color="${CORES.bg}"/>
    </linearGradient>
  </defs>
  <rect width="${W}" height="${H}" rx="16" fill="url(#h-bg)" stroke="${CORES.line}" stroke-width="1.5"/>
  <text x="20" y="26" font-family="'JetBrains Mono',ui-monospace,monospace" font-size="10" letter-spacing="1.4" fill="${CORES.accent}">CONTRIBUIÇÕES NO ÚLTIMO ANO</text>
  <text x="${W - 20}" y="26" text-anchor="end" font-family="'Space Grotesk',Segoe UI,sans-serif" font-size="16" font-weight="700" fill="${CORES.ink}">${total}</text>
  <text x="${W - 20}" y="26" text-anchor="end" dx="-${(String(total).length * 10 + 6)}" font-family="'JetBrains Mono',ui-monospace,monospace" font-size="10" fill="${CORES.mute}">total</text>
  ${labels}
  ${rotulosDias}
  ${cells}
  <text x="${W - 130}" y="${H - 15}" font-family="'JetBrains Mono',ui-monospace,monospace" font-size="9.5" fill="${CORES.mute}">menos</text>
  ${legenda}
  <text x="${W - 12}" y="${H - 15}" text-anchor="end" font-family="'JetBrains Mono',ui-monospace,monospace" font-size="9.5" fill="${CORES.mute}"></text>
</svg>
`;
}

/* ---------------- Execução ---------------- */

(async () => {
  fs.mkdirSync(OUT, { recursive: true });

  try {
    const lista = await repos();
    console.log("repos:", lista.length);
    const langs = await linguagens(lista);
    console.log("linguagens:", langs.map((l) => `${l.nome} ${l.pct.toFixed(1)}%`).join(", ") || "nenhuma");
    // NÃO sobrescreve langs.svg aqui: quem gera esse gráfico (com os repositórios
    // privados incluídos) é scripts/linguagens-manual.cjs, chamado logo depois no workflow.
    console.log("linguagens (só públicas):", langs.map((l) => `${l.nome} ${l.pct.toFixed(1)}%`).join(", ") || "nenhuma");
  } catch (e) {
    console.error("falha nas linguagens:", e.message);
  }

  try {
    const cal = await contribuicoes();
    fs.writeFileSync(path.join(OUT, "heatmap.svg"), svgHeatmap(cal));
    console.log("assets/heatmap.svg gravado", cal ? `(${cal.totalContributions} contribuições)` : "(sem dados do GraphQL)");
  } catch (e) {
    console.error("falha no heatmap:", e.message);
  }
})();
