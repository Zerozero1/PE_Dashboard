"use client";

import { useCallback, useEffect, useState } from "react";

const nf = new Intl.NumberFormat("pt-BR");
const nfc = new Intl.NumberFormat("pt-BR", { notation: "compact", maximumFractionDigits: 1 });

const MESES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

type Health = {
  status: string;
  job: { id_job: number; status: string; finalizado_em: string | null } | null;
  config: { horario_diario: string } | null;
  dados: { ultimo_dia: string | null; total: string | null } | null;
};

type DocsData = {
  de: string;
  ate: string;
  kpis: {
    emitidos: number; assinados: number; nao_assinados: number;
    pct_assinatura: number; cancelados: number; pacientes: number;
  };
  serie_mensal: { mes: string; emitidos: string }[];
  serie_origem: { mes: string; origem: string; documentos: string }[];
  por_tipo: { tipo: string; docs: string }[];
  por_uf: { uf: string; docs: string }[];
  ranking_especialidade: { especialidade: string; docs: string }[];
};

type MedData = {
  kpis: { inscricoes: number; inscricoes_ativas: number; ativos: number; medicos_com_emissao: number };
  novos_mensal: { mes: string; novos: string }[];
  por_uf: { uf: string; inscricoes_cadastradas: string; medicos_ativos: string }[];
  inatividade: { faixa: string; medicos: string }[];
};

type DispData = {
  de: string;
  ate: string;
  kpis: { dispensacoes: number; assinadas: number; canceladas: number; pacientes: number };
  serie_mensal: { mes: string; dispensacoes: string; assinadas: string; canceladas: string }[];
  por_uf: { uf: string; dispensacoes: string; assinadas: string; pct: number }[];
};

type AudData = {
  de: string;
  ate: string;
  por_dia: { dia: string; eventos: string }[];
  tipos: { tipo: string; eventos: string }[];
  dimensoes: { dimensao: string; eventos: string }[];
  detalhe: { dia: string; tipo_anomalia: string; dimensao_afetada: string; valor_observado: string; valor_esperado: string; desvio: string; severidade: number }[];
};

type FiltrosData = { ufs: string[]; tipos: { id: number; nome: string }[] };

function periodo(dias: number | "todos") {
  const ate = new Date().toISOString().slice(0, 10);
  const de = dias === "todos" ? "2021-10-01" : new Date(Date.now() - dias * 864e5).toISOString().slice(0, 10);
  return { de, ate };
}

function Sel({ label, value, onChange, options }: { label: string; value: string; onChange: (v: string) => void; options: [string, string][] }) {
  return (
    <label className="filter">
      {label}{" "}
      <select value={value} onChange={(e) => onChange(e.target.value)}>
        {options.map(([v, t]) => (
          <option key={v} value={v}>{t}</option>
        ))}
      </select>
    </label>
  );
}

const PERIODOS: [string, string][] = [["todos", "Todos"], ["30", "30 dias"], ["7", "7 dias"], ["90", "90 dias"], ["365", "12 meses"]];

const VIEWS = ["documentos", "medicos", "dispensacoes", "auditoria"] as const;
type ViewId = (typeof VIEWS)[number];

const VIEW_META: Record<ViewId, { title: string; subtitle: string; theme: string }> = {
  documentos: { title: "Documentos médicos", subtitle: "Emissões por período, UF, tipo e especialidade — UF da unidade de atendimento.", theme: "theme-cyan" },
  medicos: { title: "Médicos", subtitle: "Cadastro, situação da inscrição e atividade de prescrição por UF.", theme: "theme-blue" },
  dispensacoes: { title: "Dispensações", subtitle: "Dispensação de receitas por farmácia e farmacêutico — UF do CRF.", theme: "theme-green" },
  auditoria: { title: "Auditoria", subtitle: "Anomalias agregadas — média de referência de todos os médicos · somente agregados.", theme: "theme-red" },
};

const MIN_LON = -73.98, MAX_LAT = 5.27;
const LON_R = 73.98 - 32.39, LAT_R = 5.27 + 33.75;
const MAP_W = 800;
const MAP_H = Math.round(MAP_W * (LAT_R / LON_R));

type GeoFeat = { sigla: string; d: string; cx: number; cy: number };
let geoCache: Promise<GeoFeat[]> | null = null;

function loadGeo(): Promise<GeoFeat[]> {
  if (!geoCache) {
    geoCache = fetch("/brazil.geojson")
      .then((r) => r.json())
      .then((g: { features: { geometry: { type: string; coordinates: number[][][] | number[][][][] }; properties: { sigla: string } }[] }) =>
        g.features.map((f) => {
          const polys = f.geometry.type === "MultiPolygon" ? f.geometry.coordinates as number[][][][] : [f.geometry.coordinates as number[][][]];
          let d = "";
          let cx = 0, cy = 0, n = 0;
          for (const poly of polys) {
            for (const ring of poly) {
              let s = "";
              for (const [lon, lat] of ring) {
                const x = ((lon - MIN_LON) / LON_R) * MAP_W;
                const y = ((MAX_LAT - lat) / LAT_R) * MAP_H;
                s += (s ? " L" : "M") + x.toFixed(1) + " " + y.toFixed(1);
                cx += x; cy += y; n++;
              }
              d += s + " Z";
            }
          }
          return { sigla: f.properties.sigla, d, cx: cx / n, cy: cy / n };
        })
      );
  }
  return geoCache;
}

function MapBr({ rows, note = true }: { rows: { uf: string; v: number }[]; note?: boolean }) {
  const [geo, setGeo] = useState<GeoFeat[] | null>(null);
  useEffect(() => {
    let ok = true;
    loadGeo().then((g) => { if (ok) setGeo(g); });
    return () => { ok = false; };
  }, []);
  const max = Math.max(...rows.map((r) => r.v), 1);
  const valor = Object.fromEntries(rows.map((r) => [r.uf, r.v]));
  return (
    <div className="map-box">
      <svg viewBox={`0 0 ${MAP_W} ${MAP_H}`} style={{ width: "100%", height: "auto", maxHeight: 272 }}>
        {geo?.map((g) => {
          const v = valor[g.sigla] ?? 0;
          return (
            <path
              key={g.sigla}
              d={g.d}
              fill={v > 0 ? "var(--va)" : "#0d121a"}
              fillOpacity={v > 0 ? 0.08 + 0.5 * (v / max) : 1}
              stroke="#202936"
              strokeWidth="1"
            />
          );
        })}
        {geo?.filter((g) => (valor[g.sigla] ?? 0) > 0).map((g) => {
          const radius = 4 + ((valor[g.sigla] ?? 0) / max) * 20;
          return <circle key={`b${g.sigla}`} cx={g.cx} cy={g.cy} r={radius} fill="var(--va)" opacity=".55" />;
        })}
      </svg>
      {note && <div className="map-note">{rows.slice(0, 4).map((r) => `${r.uf} ${nf.format(r.v)}`).join(" · ")}</div>}
    </div>
  );
}

function useApi<T>(path: string, active: boolean) {
  const [data, setData] = useState<T | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(false);
  useEffect(() => {
    if (!active) return;
    let ok = true;
    setCarregando(true);
    setErro(null);
    fetch(path)
      .then((r) => r.json())
      .then((d) => { if (ok) setData(d); })
      .catch((e) => { if (ok) setErro(String(e)); })
      .finally(() => { if (ok) setCarregando(false); });
    return () => { ok = false; };
  }, [path, active]);
  return { data, erro, carregando };
}

function Processando() {
  return (
    <div className="processing" style={{ gridColumn: "span 12" }}>
      <i className="spinner" /> Processando…
    </div>
  );
}

function BarChart({ rows, bars, w = 800, h = 220 }: { rows: { x: string; v: number; v2?: number }[]; bars?: number[]; w?: number; h?: number }) {
  const maxLine = Math.max(...rows.map((r) => Math.max(r.v, r.v2 ?? 0)), 1);
  const maxBars = Math.max(...(bars ?? []), 1);
  const pad = 40;
  const iw = w - pad;
  const step = rows.length > 1 ? iw / (rows.length - 1) : 0;
  const bw = Math.min(step * 0.5, 22);
  const pts = rows.map((r, i) => `${pad + i * step},${h - (r.v / maxLine) * (h - 26)}`).join(" ");
  const pts2 = rows.filter((r) => r.v2 !== undefined).map((r, i) => `${pad + i * step},${h - ((r.v2 ?? 0) / maxLine) * (h - 26)}`).join(" ");
  const ticks = [0, 0.25, 0.5, 0.75, 1];
  const n = rows.length;
  const xStep = Math.max(Math.ceil((n - 1) / 8), 1);
  const xIdx = Array.from(new Set([0, ...Array.from({ length: n }, (_, i) => i).filter((i) => i % xStep === 0), n - 1]));
  return (
    <svg viewBox={`0 0 ${w + 52} ${h + 48}`} style={{ width: "100%", height: "auto" }}>
      {ticks.map((f) => {
        const y = h - f * (h - 26);
        return (
          <g key={`l${f}`}>
            <line x1={pad} x2={w} y1={y} y2={y} stroke="rgba(255,255,255,.07)" />
            <text x={pad - 8} y={y + 3} fontSize="9" fill="#9fb0c1" textAnchor="end">{nfc.format(maxLine * f)}</text>
          </g>
        );
      })}
      {bars && ticks.map((f) => {
        const y = h - f * (h - 26);
        return (
          <text key={`r${f}`} x={w + 14} y={y + 3} fontSize="9" fill="var(--va2)" textAnchor="start">{nfc.format(maxBars * f)}</text>
        );
      })}
      {bars && bars.map((b, i) => {
        const bh = (b / maxBars) * (h - 26);
        return (
          <rect key={i} x={pad + i * step - bw / 2} y={h - bh} width={bw} height={bh} fill="var(--va2)" opacity=".55" rx="2" stroke="var(--va2)" strokeOpacity=".25" strokeWidth="1">
            <title>{`${rows[i].x} · mês: ${nf.format(b)}`}</title>
          </rect>
        );
      })}
      <polyline fill="none" stroke="var(--va)" strokeWidth="3" points={pts} />
      {pts2 && <polyline fill="none" stroke="var(--va2)" strokeWidth="2" strokeDasharray="5 5" points={pts2} />}
      {rows.map((r, i) => (
        <circle key={i} cx={pad + i * step} cy={h - (r.v / maxLine) * (h - 26)} r="3" fill="var(--va)">
          <title>{`${r.x} · mês: ${nf.format(bars?.[i] ?? 0)} · acumulado: ${nf.format(r.v)}`}</title>
        </circle>
      ))}
      {n > 0 && (
        <text x={pad + (n - 1) * step - 12} y={h - (rows[n - 1].v / maxLine) * (h - 26) - 9} fontSize="9" fill="#9fb0c1" textAnchor="end">{nf.format(rows[n - 1].v)}</text>
      )}
      {xIdx.map((i) => {
        const [y, m] = String(rows[i].x).split("-");
        const label = m ? `${MESES[Number(m) - 1]}/${String(y).slice(2)}` : String(rows[i].x);
        return (
          <text key={i} x={pad + i * step} y={h + 18} fontSize="9" fill="#9fb0c1" textAnchor="middle">{label}</text>
        );
      })}
    </svg>
  );
}

function LinesChart({ meses, series }: { meses: string[]; series: { nome: string; cor: string; dash?: string; valores: (number | null)[] }[] }) {
  const pad = 40;
  const w = 800;
  const h = 220;
  const iw = w - pad;
  const max = Math.max(...series.flatMap((s) => s.valores.map((v) => v ?? 0)), 1);
  const step = meses.length > 1 ? iw / (meses.length - 1) : 0;
  const ticks = [0, 0.25, 0.5, 0.75, 1];
  const n = meses.length;
  const xStep = Math.max(Math.ceil((n - 1) / 8), 1);
  const xIdx = Array.from(new Set([0, ...Array.from({ length: n }, (_, i) => i).filter((i) => i % xStep === 0), n - 1]));
  return (
    <svg viewBox={`0 0 ${w + 52} ${h + 48}`} style={{ width: "100%", height: "auto" }}>
      {ticks.map((f) => {
        const y = h - f * (h - 26);
        return (
          <g key={`l${f}`}>
            <line x1={pad} x2={w} y1={y} y2={y} stroke="rgba(255,255,255,.07)" />
            <text x={pad - 8} y={y + 3} fontSize="9" fill="#9fb0c1" textAnchor="end">{nfc.format(max * f)}</text>
          </g>
        );
      })}
      {series.map((s) => {
        const pts = s.valores.map((v, i) => `${pad + i * step},${h - ((v ?? 0) / max) * (h - 26)}`).join(" ");
        return (
          <g key={s.nome}>
            <polyline fill="none" stroke={s.cor} strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" strokeDasharray={s.dash} points={pts} />
            {s.valores.map((v, i) => v !== null && (
              <circle key={i} cx={pad + i * step} cy={h - ((v ?? 0) / max) * (h - 26)} r="3" fill={s.cor} stroke="#0d121a" strokeWidth="1">
                <title>{`${meses[i]} · ${s.nome}: ${nf.format(v)}`}</title>
              </circle>
            ))}
          </g>
        );
      })}
      {xIdx.map((i) => {
        const [y, m] = String(meses[i]).split("-");
        const label = m ? `${MESES[Number(m) - 1]}/${String(y).slice(2)}` : String(meses[i]);
        return (
          <text key={i} x={pad + i * step} y={h + 18} fontSize="9" fill="#9fb0c1" textAnchor="middle">{label}</text>
        );
      })}
    </svg>
  );
}

function Bars({ rows }: { rows: { x: string; v: number }[] }) {
  const max = Math.max(...rows.map((r) => r.v), 1);
  return (
    <div style={{ display: "flex", alignItems: "flex-end", gap: 6, height: 150, paddingTop: 8 }}>
      {rows.map((r) => (
        <div key={r.x} style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "flex-end", height: "100%" }}>
          <div style={{ height: `${(r.v / max) * 100}%`, background: "var(--va)", border: "1px solid var(--va)", borderRadius: "3px 3px 0 0", minHeight: 2, opacity: .75 }} title={`${r.x}: ${nf.format(r.v)}`} />
        </div>
      ))}
    </div>
  );
}

function Donut({ rows }: { rows: { label: string; v: number }[] }) {
  const total = rows.reduce((a, b) => a + b.v, 0);
  const sorted = [...rows].sort((a, b) => b.v - a.v);
  const principais = total > 0 ? sorted.filter((r) => (r.v / total) * 100 >= 2) : sorted;
  const resto = total > 0 ? sorted.filter((r) => (r.v / total) * 100 < 2) : [];
  const data = resto.length > 0 ? [...principais, { label: "Outros", v: resto.reduce((a, b) => a + b.v, 0) }] : principais;
  const cores = ["var(--va)", "var(--va2)", "#9a7cff", "#ffb454", "#ff647c", "#7db9e8", "#f2c94c", "#34d399", "#f472b6", "#a3e635", "#c084fc", "#fdba74"];
  let acc = 0;
  const stops = data.map((r, i) => {
    const start = (acc / total) * 100;
    acc += r.v;
    return `${cores[i % cores.length]} ${start}% ${(acc / total) * 100}%`;
  }).join(", ");
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
      <div style={{ position: "relative", width: 150, height: 150 }}>
        <div style={{ width: 150, height: 150, borderRadius: "50%", background: `conic-gradient(${stops})` }} />
        <div style={{ position: "absolute", inset: 24, borderRadius: "50%", background: "#0d121a", border: "1px solid #202a35", display: "grid", placeItems: "center" }}>
          <div style={{ textAlign: "center" }}>
            <strong style={{ fontSize: 18, color: "var(--va)" }}>{nf.format(total)}</strong>
            <div style={{ color: "#6f7b88", fontSize: 9, textTransform: "uppercase", letterSpacing: ".1em" }}>documentos</div>
          </div>
        </div>
      </div>
      <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
        {data.map((r, i) => (
          <li key={r.label} style={{ display: "flex", gap: 7, fontSize: 10, color: "#8d99a7", marginBottom: 6 }}>
            <i style={{ width: 9, height: 9, borderRadius: 2, background: cores[i % cores.length], flex: "none" }} />
            {r.label}
            <b style={{ marginLeft: "auto", paddingLeft: 12, color: "#c3ccd6" }}>{total ? Math.round((r.v / total) * 100) : 0}%</b>
          </li>
        ))}
      </ul>
    </div>
  );
}

function RankRows({ rows, showPct }: { rows: { name: string; v: number }[]; showPct?: boolean }) {
  const max = Math.max(...rows.map((r) => r.v), 1);
  const total = rows.reduce((a, b) => a + b.v, 0);
  return rows.map((r) => (
    <div className="barrow" key={r.name}>
      <span>{r.name}</span>
      <span className="bar-track"><i className="bar-fill" style={{ width: `${(r.v / max) * 100}%` }} /></span>
      <b>
        {nf.format(r.v)}
        {showPct && total > 0 && <span style={{ color: "#667381", fontWeight: 400 }}> · {Math.round((r.v / total) * 1000) / 10}%</span>}
      </b>
    </div>
  ));
}

function KpiCard({ label, value, meta }: { label: string; value: string; meta: string }) {
  return (
    <article className="card kpi">
      <div className="label">{label}</div>
      <div className="value">{value}</div>
      <div className="meta">{meta}</div>
    </article>
  );
}

function DocumentsView({ active, filtros }: { active: boolean; filtros: FiltrosData | null }) {
  const [dias, setDias] = useState<"todos" | string>("todos");
  const [uf, setUf] = useState("");
  const [tipo, setTipo] = useState("");
  const { de, ate } = periodo(dias === "todos" ? "todos" : Number(dias));
  const qs = `de=${de}&ate=${ate}&uf=${uf}&tipo=${tipo}`;
  const { data, erro, carregando } = useApi<DocsData>(`/api/dashboard/documentos?${qs}`, active);
  if (erro) return <div className="card" style={{ gridColumn: "span 12", color: "var(--red)" }}>Erro: {erro}</div>;
  if (!data) return <div className="card" style={{ gridColumn: "span 12", color: "#566271" }}>Carregando…</div>;
  const k = data.kpis;
  let acumulado = 0;
  const serieAcumulada = data.serie_mensal.map((s) => {
    acumulado += Number(s.emitidos);
    return { x: s.mes, v: acumulado };
  });
  const mensal = data.serie_mensal.map((s) => Number(s.emitidos));
  const ultimo = data.serie_mensal[data.serie_mensal.length - 1];
  const [uy, um] = ultimo ? ultimo.mes.split("-") : ["", ""];
  const ultimoLabel = um ? `${MESES[Number(um) - 1]}/${String(uy).slice(2)}` : "—";
  const ORIGENS: { key: string; nome: string; cor: string; dash?: string }[] = [
    { key: "WEB", nome: "Web", cor: "#60a5fa" },
    { key: "WEB-MOBILE", nome: "Web mobile", cor: "#fbbf24" },
    { key: "IOS", nome: "iOS", cor: "#f472b6", dash: "2 4" },
    { key: "ANDROID", nome: "Android", cor: "#4ade80", dash: "10 4 2 4" },
  ];
  const mesesOrigem = Array.from(new Set(data.serie_origem.map((s) => s.mes))).sort();
  const mapOrigem = new Map(data.serie_origem.map((s) => [`${s.mes}|${s.origem}`, Number(s.documentos)]));
  const seriesOrigem = ORIGENS
    .map((o) => ({
      nome: o.nome,
      cor: o.cor,
      dash: o.dash,
      valores: mesesOrigem.map((m) => {
        const v = mapOrigem.get(`${m}|${o.key}`);
        return v === undefined ? null : v;
      }),
    }))
    .filter((s) => s.valores.some((v) => (v ?? 0) > 0));
  const totalUf = data.por_uf.reduce((a, u) => a + Number(u.docs), 0);
  const pctUf = (v: number, t: number) => `${(t > 0 ? ((v / t) * 100).toFixed(1) : "0.0").replace(".", ",")}%`;
  const milUf = (v: number) => Math.round(v / 1000).toLocaleString("pt-BR");
  return (
    <section className="grid">
      <div className="filters" style={{ gridColumn: "span 12" }}>
        <Sel label="Período" value={dias} onChange={setDias} options={PERIODOS} />
        <Sel label="UF" value={uf} onChange={setUf} options={[["", "Todas"], ...(filtros?.ufs.map((u) => [u, u] as [string, string]) ?? [])]} />
        <Sel label="Tipo" value={tipo} onChange={setTipo} options={[["", "Todos"], ...(filtros?.tipos.map((t) => [String(t.id), t.nome] as [string, string]) ?? [])]} />
        <div className="meta">{de} → {ate}</div>
      </div>
      {carregando && <Processando />}
      <KpiCard label="Emitidos" value={nf.format(k.emitidos)} meta="no período" />
      <KpiCard label="Assinados" value={nf.format(k.assinados)} meta="no período" />
      <KpiCard label="Não assinados" value={nf.format(k.nao_assinados)} meta="no período" />
      <KpiCard label="% Assinatura" value={`${k.pct_assinatura}%`} meta="assinados/emitidos" />
      <KpiCard label="Cancelados" value={nf.format(k.cancelados)} meta="no período" />
      <KpiCard label="Pacientes distintos" value={nf.format(k.pacientes)} meta="no período" />

      <article className="card chart-main">
        <div className="section-title">
          <h2>Emissões por mês</h2>
          <div className="legend"><span><i className="l1" />Acumulado</span><span><i className="l2" />Mês (escala própria)</span></div>
        </div>
        <div className="chart">
          <BarChart rows={serieAcumulada} bars={mensal} />
        </div>
        <div className="sub" style={{ marginTop: 4 }}>Total emitido em {ultimoLabel}: <b style={{ color: "var(--va)" }}>{nf.format(Number(ultimo?.emitidos ?? 0))}</b> · Acumulado: {nf.format(acumulado)}</div>
      </article>

      <article className="card side-chart">
        <div className="section-title"><h2>Distribuição por tipo</h2><span>{data.de.slice(0, 7)} → {data.ate.slice(0, 7)}</span></div>
        <Donut rows={data.por_tipo.map((t) => ({ label: t.tipo, v: Number(t.docs) }))} />
      </article>

      <article className="card" style={{ gridColumn: "span 12" }}>
        <div className="section-title">
          <h2>Origem de criação por mês</h2>
          <div className="legend">{seriesOrigem.map((s) => <span key={s.nome}><i style={{ background: s.cor, width: 18, height: 4, borderRadius: 2, alignSelf: "center" }} />{s.nome}</span>)}</div>
        </div>
        <div className="chart">
          <LinesChart meses={mesesOrigem} series={seriesOrigem} />
        </div>
      </article>

      <article className="card" style={{ gridColumn: "span 7" }}>
        <div className="section-title"><h2>Documentos emitidos por UF</h2></div>
        <div style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
          <div style={{ flex: 1.1, minWidth: 0 }}>
            <MapBr note={false} rows={data.por_uf.map((u) => ({ uf: u.uf, v: Number(u.docs) }))} />
          </div>
          <div className="uf-scroll" style={{ flex: 1, maxHeight: 292, overflowY: "auto", paddingRight: 4 }}>
            <table className="table" style={{ fontSize: 10 }}>
              <thead><tr><th>UF</th><th style={{ textAlign: "right" }}>Mil</th><th style={{ textAlign: "right" }}>% total</th></tr></thead>
              <tbody>
                {data.por_uf.map((u) => (
                  <tr key={u.uf}>
                    <td>{u.uf}</td>
                    <td style={{ textAlign: "right" }}>{milUf(Number(u.docs))}</td>
                    <td style={{ textAlign: "right" }}>
                      {pctUf(Number(u.docs), totalUf)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </article>

      <article className="card" style={{ gridColumn: "span 5" }}>
        <div className="section-title"><h2>Documentos por especialidade</h2></div>
        <RankRows showPct rows={data.ranking_especialidade.map((e) => ({ name: e.especialidade, v: Number(e.docs) }))} />
      </article>
    </section>
  );
}

function MedicosView({ active, filtros }: { active: boolean; filtros: FiltrosData | null }) {
  const [dias, setDias] = useState<"todos" | string>("todos");
  const [uf, setUf] = useState("");
  const { de, ate } = periodo(dias === "todos" ? "todos" : Number(dias));
  const qs = `de=${de}&ate=${ate}&uf=${uf}`;
  const { data, erro, carregando } = useApi<MedData>(`/api/dashboard/medicos?${qs}`, active);
  if (erro) return <div className="card" style={{ gridColumn: "span 12", color: "var(--red)" }}>Erro: {erro}</div>;
  if (!data) return <div className="card" style={{ gridColumn: "span 12", color: "#566271" }}>Carregando…</div>;
  const k = data.kpis;
  const faixas = ["0-30", "31-60", "61-90", "91-120", "120+"];
  return (
    <section className="grid">
      <div className="filters" style={{ gridColumn: "span 12" }}>
        <Sel label="Período" value={dias} onChange={setDias} options={PERIODOS} />
        <Sel label="UF" value={uf} onChange={setUf} options={[["", "Todas"], ...(filtros?.ufs.map((u) => [u, u] as [string, string]) ?? [])]} />
        <div className="meta">snapshot na última carga · {de} → {ate}</div>
      </div>
      {carregando && <Processando />}
      <KpiCard label="Inscrições cadastradas" value={nf.format(k.inscricoes)} meta="CRM/UF (snapshot)" />
      <KpiCard label="Médicos ativos" value={nf.format(k.ativos)} meta="in_situacao = A" />
      <KpiCard label="Inscrições ativas" value={nf.format(k.inscricoes_ativas)} meta="snapshot" />
      <KpiCard label="Emissões no período" value={nf.format(k.medicos_com_emissao)} meta="médicos distintos" />

      <article className="card chart-main">
        <div className="section-title"><h2>Novos médicos por mês</h2><div className="legend"><span><i className="l1" />proxy dh_atualizacao</span></div></div>
        <div className="chart">
          <BarChart rows={data.novos_mensal.map((s) => ({ x: s.mes, v: Number(s.novos) }))} />
        </div>
      </article>

      <article className="card side-chart">
        <div className="section-title"><h2>Médicos por UF</h2><span>inscrições cadastradas</span></div>
        <RankRows rows={data.por_uf.slice(0, 8).map((u) => ({ name: u.uf, v: Number(u.inscricoes_cadastradas) }))} />
      </article>

      <article className="card" style={{ gridColumn: "span 7" }}>
        <div className="section-title"><h2>Médicos ativos por UF</h2><span>mapa — snapshot</span></div>
        <MapBr rows={data.por_uf.map((u) => ({ uf: u.uf, v: Number(u.medicos_ativos) }))} />
      </article>

      <article className="card" style={{ gridColumn: "span 5" }}>
        <div className="section-title"><h2>Inatividade por faixa sem emissão</h2><span>dias desde a última emissão</span></div>
        <table className="table">
          <thead><tr><th>Faixa (dias)</th><th>Médicos</th><th>Status</th></tr></thead>
          <tbody>
            {faixas.map((f) => {
              const row = data.inatividade.find((i) => i.faixa === f);
              const badge = f === "91-120" ? "warn" : f === "120+" ? "bad" : "ok";
              return (
                <tr key={f}>
                  <td>{f}</td>
                  <td>{row ? nf.format(Number(row.medicos)) : "0"}</td>
                  <td><span className={`badge ${badge}`}>{f === "120+" ? "Crítico" : f === "91-120" ? "Atenção" : "Observar"}</span></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </article>
    </section>
  );
}

function DispensacoesView({ active, filtros }: { active: boolean; filtros: FiltrosData | null }) {
  const [dias, setDias] = useState<"todos" | string>("todos");
  const [uf, setUf] = useState("");
  const { de, ate } = periodo(dias === "todos" ? "todos" : Number(dias));
  const qs = `de=${de}&ate=${ate}&uf=${uf}`;
  const { data, erro, carregando } = useApi<DispData>(`/api/dashboard/dispensacoes?${qs}`, active);
  if (erro) return <div className="card" style={{ gridColumn: "span 12", color: "var(--red)" }}>Erro: {erro}</div>;
  if (!data) return <div className="card" style={{ gridColumn: "span 12", color: "#566271" }}>Carregando…</div>;
  const k = data.kpis;
  return (
    <section className="grid">
      <div className="filters" style={{ gridColumn: "span 12" }}>
        <Sel label="Período" value={dias} onChange={setDias} options={PERIODOS} />
        <Sel label="UF" value={uf} onChange={setUf} options={[["", "Todas"], ...(filtros?.ufs.map((u) => [u, u] as [string, string]) ?? [])]} />
        <div className="meta">{de} → {ate}</div>
      </div>
      {carregando && <Processando />}
      <KpiCard label="Dispensações" value={nf.format(k.dispensacoes)} meta="status D (histórico)" />
      <KpiCard label="Assinadas" value={nf.format(k.assinadas)} meta="in_assinado = S" />
      <KpiCard label="Canceladas" value={nf.format(k.canceladas)} meta="status C" />
      <KpiCard label="Pacientes distintos" value={nf.format(k.pacientes)} meta="no período" />

      <article className="card chart-main">
        <div className="section-title"><h2>Dispensações por mês</h2><div className="legend"><span><i className="l1" />Dispensadas</span><span><i className="l2" />Canceladas</span></div></div>
        <div className="chart">
          <BarChart rows={data.serie_mensal.map((s) => ({ x: s.mes, v: Number(s.dispensacoes), v2: Number(s.canceladas) }))} />
        </div>
      </article>

      <article className="card side-chart">
        <div className="section-title"><h2>Dispensações por UF</h2><span>{data.de.slice(0, 7)} → {data.ate.slice(0, 7)}</span></div>
        <RankRows rows={data.por_uf.slice(0, 8).map((u) => ({ name: u.uf, v: Number(u.dispensacoes) }))} />
      </article>

      <article className="card" style={{ gridColumn: "span 7" }}>
        <div className="section-title"><h2>Mapa por UF</h2><span>UF do CRF do farmacêutico</span></div>
        <MapBr rows={data.por_uf.map((u) => ({ uf: u.uf, v: Number(u.dispensacoes) }))} />
      </article>

      <article className="card" style={{ gridColumn: "span 5" }}>
        <div className="section-title"><h2>Totais e assinadas por UF</h2><span>assinatura única</span></div>
        <table className="table">
          <thead><tr><th>UF</th><th>Dispensações</th><th>Assinadas</th><th>% Assin.</th></tr></thead>
          <tbody>
            {data.por_uf.slice(0, 10).map((r) => (
              <tr key={r.uf}>
                <td>{r.uf}</td>
                <td>{nf.format(Number(r.dispensacoes))}</td>
                <td>{nf.format(Number(r.assinadas))}</td>
                <td>{r.pct}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      </article>
    </section>
  );
}

function AuditoriaView({ active }: { active: boolean }) {
  const [dias, setDias] = useState<"todos" | string>("todos");
  const [tipo, setTipo] = useState("");
  const { de, ate } = periodo(dias === "todos" ? "todos" : Number(dias));
  const qs = `de=${de}&ate=${ate}&tipo=${tipo}`;
  const { data, erro, carregando } = useApi<AudData>(`/api/dashboard/auditoria?${qs}`, active);
  if (erro) return <div className="card" style={{ gridColumn: "span 12", color: "var(--red)" }}>Erro: {erro}</div>;
  if (!data) return <div className="card" style={{ gridColumn: "span 12", color: "#566271" }}>Carregando…</div>;
  return (
    <section className="grid">
      <div className="filters" style={{ gridColumn: "span 12" }}>
        <Sel label="Período" value={dias} onChange={setDias} options={[["todos", "Todos"], ["7", "7 dias"], ["30", "30 dias"], ["90", "90 dias"]]} />
        <Sel label="Tipo de anomalia" value={tipo} onChange={setTipo} options={[["", "Todas"], ["AN1", "AN1 · Documentos"], ["AN2", "AN2 · Pacientes"], ["AN3", "AN3 · Tempo emissões"], ["AN4", "AN4 · Local"]]} />
        <div className="meta">{de} → {ate} · somente agregados</div>
      </div>
      {carregando && <Processando />}
      <article className="card chart-main">
        <div className="section-title"><h2>Eventos por dia</h2><div className="legend"><span><i className="l1" />Anomalias detectadas</span></div></div>
        <div className="chart">
          <BarChart rows={data.por_dia.map((d) => ({ x: d.dia.slice(5), v: Number(d.eventos) }))} />
        </div>
      </article>
      <article className="card side-chart">
        <div className="section-title"><h2>Tipos de anomalia</h2><span>ranking</span></div>
        <RankRows rows={data.tipos.map((t) => ({ name: t.tipo, v: Number(t.eventos) }))} />
      </article>
      <article className="card" style={{ gridColumn: "span 7" }}>
        <div className="section-title"><h2>Detalhe agregado — dia × dimensão × tipo</h2><span>observado vs. média esperada</span></div>
        <table className="table">
          <thead><tr><th>Dia</th><th>Anomalia</th><th>Dimensão</th><th>Observado</th><th>Média esperada</th><th>Desvio</th><th>Severidade</th></tr></thead>
          <tbody>
            {data.detalhe.slice(0, 30).map((r, i) => (
              <tr key={i}>
                <td>{String(r.dia).slice(0, 10)}</td>
                <td>{r.tipo_anomalia}</td>
                <td>{r.dimensao_afetada}</td>
                <td>{nf.format(Number(r.valor_observado))}</td>
                <td>{nf.format(Number(r.valor_esperado))}</td>
                <td>{Number(r.desvio).toFixed(1)}x</td>
                <td><span className={`badge ${Number(r.severidade) >= 5 ? "bad" : "warn"}`}>{r.severidade}x</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </article>
      <article className="card" style={{ gridColumn: "span 5" }}>
        <div className="section-title"><h2>Dimensões afetadas</h2><span>ranking</span></div>
        <RankRows rows={data.dimensoes.map((d) => ({ name: d.dimensao, v: Number(d.eventos) }))} />
      </article>
      <article className="sql-box">
        <span className="kw">SELECT</span> dia, tipo_anomalia, valor_observado, valor_esperado, desvio <span className="kw">FROM</span> prescricao.fato_auditoria_dia <span className="kw">WHERE</span> dia <span className="kw">BETWEEN</span> '{data.de}' <span className="kw">AND</span> '{data.ate}'
      </article>
    </section>
  );
}

const ADMIN_EMAIL = "mrichard@portalmedico.org.br";
const STATUS_PT: Record<string, string> = {
  queued: "na fila",
  running: "em execução",
  success: "concluída",
  failed: "falhou",
};

export default function Dashboard({ email, mock }: { email: string; mock?: boolean }) {
  const [view, setView] = useState<ViewId>("documentos");
  const [health, setHealth] = useState<Health | null>(null);
  const [btn, setBtn] = useState("Atualizar dados");
  const [filtros, setFiltros] = useState<FiltrosData | null>(null);

  useEffect(() => {
    fetch("/api/filtros")
      .then((r) => r.json())
      .then(setFiltros)
      .catch(() => setFiltros(null));
  }, []);

  const loadHealth = useCallback(async () => {
    try {
      const res = await fetch("/api/health");
      setHealth(await res.json());
    } catch {
      setHealth(null);
    }
  }, []);

  useEffect(() => {
    loadHealth();
    const id = setInterval(loadHealth, 30000);
    return () => clearInterval(id);
  }, [loadHealth]);

  const refresh = async () => {
    setBtn("⟳ Em fila…");
    try {
      const res = await fetch("/api/admin/refresh-jobs", { method: "POST" });
      const data = await res.json();
      setBtn(data.status === "ja_em_execucao" ? "Job em execução" : "⟳ Em fila…");
    } catch {
      setBtn("Falhou");
    }
    setTimeout(() => setBtn("Atualizar dados"), 5000);
    loadHealth();
  };

  const job = health?.job;
  const chipCls = job?.status === "success" ? "ok" : job?.status === "failed" ? "bad" : "warn";
  const dadosDia = health?.dados?.ultimo_dia;

  return (
    <>
      <header className="top">
        <div className="brand">
          <img src="/cfm.png" alt="CFM" style={{ height: 36, width: "auto", borderRadius: 8 }} />
          <div><strong>Prescrição</strong><span>Eletrônica CFM</span></div>
        </div>
        <div className="top-right">
          <span className={`chip ${chipCls}`}>
            <i className={`dot ${job?.status === "failed" ? "bad" : ""}`} />
            Carga <b>{job ? STATUS_PT[job.status] ?? job.status : "—"}</b>
          </span>
          <span className="chip">Dados <b>{dadosDia ? new Date(dadosDia).toLocaleDateString("pt-BR") : "—"}</b></span>
          {email === ADMIN_EMAIL && (
            <button className="btn primary" onClick={refresh} disabled={btn !== "Atualizar dados"}>{btn}</button>
          )}
          <span className="chip">{mock ? "DEV" : email}</span>
        </div>
      </header>

      <nav className="tabs">
        {VIEWS.map((v) => (
          <button key={v} className={`tab ${view === v ? "active" : ""}`} data-view={v} onClick={() => setView(v)}>
            {VIEW_META[v].title}
          </button>
        ))}
      </nav>

      <main className="main">
        {VIEWS.map((v) => (
          <section key={v} className={`view ${VIEW_META[v].theme} ${view === v ? "active" : ""}`}>
            <header className="topbar">
              <div>
                <div className="eyebrow">VISÃO</div>
                <h1>{VIEW_META[v].title}</h1>
                <div className="subtitle">{VIEW_META[v].subtitle}</div>
              </div>
            </header>
            {v === "documentos" && <DocumentsView active={view === v} filtros={filtros} />}
            {v === "medicos" && <MedicosView active={view === v} filtros={filtros} />}
            {v === "dispensacoes" && <DispensacoesView active={view === v} filtros={filtros} />}
            {v === "auditoria" && <AuditoriaView active={view === v} />}
          </section>
        ))}
        <div className="footer">
          <span>PE Dashboard · CFM</span>
          <span>Datamart prescricao_dw · última carga: {health?.job?.finalizado_em ? new Date(health.job.finalizado_em).toLocaleString("pt-BR") : "—"}</span>
        </div>
      </main>
    </>
  );
}
