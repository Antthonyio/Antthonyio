// linguagens manuais (inclui repositórios privados), mescladas com a API
const fs = require("fs"), path = require("path");
const TOKEN = process.env.GH_TOKEN || "", LOGIN = process.env.GH_LOGIN || "Antthonyio";
const OUT = path.join(__dirname, "..", "assets");
const api = (p) => fetch(`https://api.github.com${p}`, { headers: { Accept: "application/vnd.github+json", "User-Agent": "perfil", ...(TOKEN ? { Authorization: `Bearer ${TOKEN}` } : {}) } });
const CORES = { bg:"#0b0910", surface:"#12101a", line:"#241f33", ink:"#f4f0fa", soft:"#b6adc8", mute:"#8b82a0", accent:"#b14aed", accent2:"#e83e8c" };
const LANG_CORES = { TypeScript:"#3178c6", JavaScript:"#f1e05a", Python:"#3572A5", Lua:"#000080", "C#":"#178600", HTML:"#e34c26", CSS:"#563d7c", Shell:"#89e051", Dockerfile:"#384d54", Vue:"#41b883", Go:"#00ADD8", Rust:"#dea584", Java:"#b07219", PHP:"#4F5D95", Ruby:"#701516", "C++":"#f34b7d", C:"#555555", SQL:"#e38c00", SCSS:"#c6538c", EJS:"#a91e50", Batchfile:"#C1F12E", PowerShell:"#012456", Kotlin:"#A97BFF", Swift:"#F05138" };
const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;" }[c]));

(async () => {
  const man = JSON.parse(fs.readFileSync(path.join(__dirname, "linguagens.json"), "utf8"));
  // 1) bytes reais dos repositórios públicos
  const bytes = {};
  for (let page = 1; page <= 5; page++) {
    const res = await api(`/users/${LOGIN}/repos?per_page=100&page=${page}&sort=pushed`);
    if (!res.ok) break;
    const lista = await res.json();
    if (!Array.isArray(lista) || !lista.length) break;
    for (const r of lista) {
      if (!r.size) continue;
      const lr = await api(`/repos/${r.full_name}/languages`);
      if (!lr.ok) continue;
      for (const [k, v] of Object.entries(await lr.json())) bytes[k] = (bytes[k] || 0) + v;
    }
  }
  // 2) repositórios privados: pesos declarados em linguagens.json
  for (const [k, v] of Object.entries(man.pesos || {})) bytes[k] = (bytes[k] || 0) + v;
  const total = Object.values(bytes).reduce((a, b) => a + b, 0) || 1;
  const dados = Object.entries(bytes).map(([nome, b]) => ({ nome, bytes: b, pct: b / total * 100, cor: LANG_CORES[nome] || CORES.accent })).sort((a, b) => b.bytes - a.bytes).slice(0, 8);
  console.log("linguagens:", dados.map((d) => `${d.nome} ${d.pct.toFixed(1)}%`).join(", "));

  const W = 1200, H = 128, barX = 40, barY = 34, barW = W - 80, barH = 14;
  let x = barX;
  const segs = dados.map((d) => { const w = Math.max((d.pct / 100) * barW, 2); const s = `<rect x="${x.toFixed(1)}" y="${barY}" width="${w.toFixed(1)}" height="${barH}" fill="${d.cor}"/>`; x += w; return s; }).join("");
  const leg = dados.slice(0, 6).map((d, i) => {
    const lx = 40 + (i % 3) * 385, ly = 84 + Math.floor(i / 3) * 26;
    return `<g transform="translate(${lx},${ly})"><circle cx="5" cy="-4" r="5" fill="${d.cor}"/><text x="18" y="0" font-family="'JetBrains Mono',ui-monospace,monospace" font-size="12" fill="${CORES.soft}">${esc(d.nome)}</text><text x="150" y="0" font-family="'JetBrains Mono',ui-monospace,monospace" font-size="12" fill="${CORES.mute}">${d.pct.toFixed(1)}%</text></g>`;
  }).join("");
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" fill="none" role="img" aria-label="Distribuição de linguagens">
  <defs><linearGradient id="l-bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${CORES.surface}"/><stop offset="1" stop-color="${CORES.bg}"/></linearGradient>
  <clipPath id="l-clip"><rect x="${barX}" y="${barY}" width="${barW}" height="${barH}" rx="7"/></clipPath></defs>
  <rect width="${W}" height="${H}" rx="16" fill="url(#l-bg)" stroke="${CORES.line}" stroke-width="1.5"/>
  <text x="40" y="24" font-family="'JetBrains Mono',ui-monospace,monospace" font-size="10" letter-spacing="1.4" fill="${CORES.accent}">DISTRIBUIÇÃO POR BYTES DE CÓDIGO · PÚBLICOS + PRIVADOS</text>
  <g clip-path="url(#l-clip)"><rect x="${barX}" y="${barY}" width="${barW}" height="${barH}" fill="${CORES.line}"/>${segs}</g>
  ${leg}
</svg>
`;
  fs.writeFileSync(path.join(OUT, "langs.svg"), svg);
  console.log("assets/langs.svg gravado");
})();
