"use client";

import { useCallback, useEffect, useRef, useState } from "react";

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
    pct_assinatura: number; cancelados: number;
  };
  serie_mensal: { mes: string; emitidos: string }[];
  serie_origem: { mes: string; origem: string; documentos: string }[];
  totais_versao: { versao: string; documentos: string }[];
  por_tipo: { tipo: string; docs: string }[];
  por_uf: { uf: string; docs: string }[];
  ranking_especialidade: { especialidade: string; docs: string }[];
  ranking_medicamentos: { medicamento: string; categoria: string; itens: string }[];
};

type AudAn3Row = {
  id_medico: number;
  crm: string;
  crm_uf: string;
  nome: string | null;
  dia: string;
  documentos: string;
  pacientes: string;
};

type AudAn3Detail = {
  id_medico: number;
  dia: string;
  medico: { nome: string | null; crm: string | null; crm_uf: string | null };
  resumo: { documentos: string; pacientes: string };
  por_tipo: { tipo: string; documentos: string }[];
  documentos: { ds_qrcode: string | null; data_hora: string; tipo: string; instituicao: string; cnes: string | null; uf: string; in_assinado: string; in_cancelado: string }[];
};

type AudAn4Row = {
  chave: string;
  instituicao: string;
  cnes: string | null;
  uf: string | null;
  unidades: number;
  medicos: number;
  pacientes: string;
};

type AudAn4Detail = {
  chave: string;
  instituicao: string;
  cnes: string | null;
  uf: string | null;
  total_pacientes: string;
  total_unidades: number;
  serie_mensal: { mes: string; pacientes: string }[];
  unidades: { id_unidade_atendimento: number; nome: string; cnes: string | null; uf: string; pacientes: string }[];
  por_tipo: { tipo: string; documentos: string }[];
};

type MedData = {
  kpis: { inscricoes: number; ativos: number };
  novos_mensal: { mes: string; novos: string }[];
  por_uf: { uf: string; inscricoes_cadastradas: string; medicos_ativos: string }[];
  inatividade: { faixa: string; medicos: string }[];
  emissores_mensal: { mes: string; emissao: string }[];
  emissores_30d: number;
};

type AudData = {
  de: string;
  ate: string;
  an1: { id_medico: number; crm: string; crm_uf: string; nome: string; docs: string }[];
  an2?: { id_medico: number; crm: string; crm_uf: string; nome: string; pacientes: string }[];
  an3?: AudAn3Row[];
  an4?: AudAn4Row[];
};

type AudMedicoData = {
  medico: { nome: string; crm: string; crm_uf: string; situacao: string | null; tipo_inscricao: string | null } | null;
  por_tipo: { tipo: string; docs: string }[];
  serie_mensal: { mes: string; docs: string }[];
  especialidades: string[];
  total_pacientes: number | null;
};

type FiltrosData = { ufs: string[]; tipos: { id: number; nome: string }[] };

type LogsData = {
  acessos: { id_access_log: number; nm_email: string; tx_ip: string | null; in_sucesso: boolean; dh_evento: string }[];
  jobs: { id_job: number; tipo: string; status: string; solicitado_por: string | null; agendado_para: string | null; iniciado_em: string | null; finalizado_em: string | null; mensagem: string | null }[];
};

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

const VIEWS = ["documentos", "medicos", "auditoria"] as const;
type ViewId = (typeof VIEWS)[number] | "logs";

const VIEW_META: Record<ViewId, { title: string; subtitle: string; theme: string }> = {
  documentos: { title: "Documentos médicos", subtitle: "Emissões por período, UF, tipo e especialidade — UF da unidade de atendimento.", theme: "theme-cyan" },
  medicos: { title: "Médicos", subtitle: "Cadastro, situação da inscrição e atividade de prescrição por UF.", theme: "theme-cyan" },
  auditoria: { title: "Auditoria", subtitle: "Anomalias agregadas — média de referência de todos os médicos · somente agregados.", theme: "theme-cyan" },
  logs: { title: "Logs", subtitle: "Utilização (logins) e atualizações de dados — visão administrativa.", theme: "theme-cyan" },
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
    const run = () => {
      setCarregando(true);
      setErro(null);
      fetch(path)
        .then((r) => r.json())
        .then((d) => { if (ok) setData(d); })
        .catch((e) => { if (ok) setErro(String(e)); })
        .finally(() => { if (ok) setCarregando(false); });
    };
    const t = setTimeout(run, 0);
    return () => { ok = false; clearTimeout(t); };
  }, [path, active]);
  return { data, erro, carregando };
}

function Processando({ onCancel }: { onCancel?: () => void }) {
  return (
    <div className="processing" style={{ gridColumn: "span 12" }}>
      <i className="spinner" /> Processando…
      {onCancel && (
        <button className="btn" type="button" onClick={onCancel} style={{ padding: "3px 10px", fontSize: 10 }} title="Interromper a consulta em andamento">
          Cancelar
        </button>
      )}
    </div>
  );
}

function BarChart({ rows, bars, w = 800, h = 220, tick = 9, labelCentralizado = false }: { rows: { x: string; v: number; v2?: number }[]; bars?: number[]; w?: number; h?: number; tick?: number; labelCentralizado?: boolean }) {
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
            <text x={pad - 8} y={y + 3} fontSize={tick} fill="#9fb0c1" textAnchor="end">{nfc.format(maxLine * f)}</text>
          </g>
        );
      })}
      {bars && ticks.map((f) => {
        const y = h - f * (h - 26);
        return (
          <text key={`r${f}`} x={w + 14} y={y + 3} fontSize={tick} fill="var(--va2)" textAnchor="start">{nfc.format(maxBars * f)}</text>
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
        <text
          x={pad + (n - 1) * step + (labelCentralizado ? 0 : -12)}
          y={h - (rows[n - 1].v / maxLine) * (h - 26) - (labelCentralizado ? 11 : 9)}
          fontSize="9"
          fill="#9fb0c1"
          textAnchor={labelCentralizado ? "middle" : "end"}
        >{nf.format(rows[n - 1].v)}</text>
      )}
      {xIdx.map((i) => {
        const [y, m] = String(rows[i].x).split("-");
        const label = m ? `${MESES[Number(m) - 1]}/${String(y).slice(2)}` : String(rows[i].x);
        return (
          <text key={i} x={pad + i * step} y={h + 18} fontSize={tick} fill="#9fb0c1" textAnchor="middle">{label}</text>
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
  const ticks: number[] = [];
  for (let k = 0; Math.pow(10, k) <= max; k++) ticks.push(Math.pow(10, k));
  const yPos = (v: number) => h - (Math.log10(Math.max(v, 1)) / Math.log10(max)) * (h - 26);
  const n = meses.length;
  const xStep = Math.max(Math.ceil((n - 1) / 8), 1);
  const xIdx = Array.from(new Set([0, ...Array.from({ length: n }, (_, i) => i).filter((i) => i % xStep === 0), n - 1]));
  return (
    <svg viewBox={`0 0 ${w + 52} ${h + 48}`} style={{ width: "100%", height: "auto" }}>
      {ticks.map((t) => {
        const y = yPos(t);
        return (
          <g key={`l${t}`}>
            <line x1={pad} x2={w} y1={y} y2={y} stroke="rgba(255,255,255,.07)" />
            <text x={pad - 8} y={y + 3} fontSize="9" fill="#9fb0c1" textAnchor="end">{nfc.format(t)}</text>
          </g>
        );
      })}
      {series.map((s) => {
        const pts = s.valores.map((v, i) => `${pad + i * step},${yPos(v ?? 0)}`).join(" ");
        return (
          <g key={s.nome}>
            <polyline fill="none" stroke={s.cor} strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" strokeDasharray={s.dash} points={pts} />
            {s.valores.map((v, i) => v !== null && (
              <circle key={i} cx={pad + i * step} cy={yPos(v ?? 0)} r="3" fill={s.cor} stroke="#0d121a" strokeWidth="1">
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

function Donut({ rows, cores, agruparOutros = true, pctDec = 0 }: { rows: { label: string; v: number }[]; cores?: string[]; agruparOutros?: boolean; pctDec?: number }) {
  const total = rows.reduce((a, b) => a + b.v, 0);
  const sorted = cores ? rows : [...rows].sort((a, b) => b.v - a.v);
  const principais = agruparOutros && total > 0 ? sorted.filter((r) => (r.v / total) * 100 >= 2) : sorted;
  const resto = agruparOutros && total > 0 ? sorted.filter((r) => (r.v / total) * 100 < 2) : [];
  const data = resto.length > 0 ? [...principais, { label: "Outros", v: resto.reduce((a, b) => a + b.v, 0) }] : principais;
  const coresPadrao = ["var(--va)", "var(--va2)", "#9a7cff", "#ffb454", "#ff647c", "#7db9e8", "#f2c94c", "#34d399", "#f472b6", "#a3e635", "#c084fc", "#fdba74"];
  const paleta = cores ?? coresPadrao;
  const prefixo = data.map((_, i) => data.slice(0, i).reduce((a, b) => a + b.v, 0));
  const stops = data.map((r, i) => {
    const start = (prefixo[i] / total) * 100;
    const end = ((prefixo[i] + r.v) / total) * 100;
    return `${paleta[i % paleta.length]} ${start}% ${end}%`;
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
            <i style={{ width: 9, height: 9, borderRadius: 2, background: paleta[i % paleta.length], flex: "none" }} />
            {r.label}
            <b style={{ marginLeft: "auto", paddingLeft: 12, color: "#c3ccd6" }}>{total ? ((r.v / total) * 100).toFixed(pctDec).replace(".", ",") : "0"}%</b>
          </li>
        ))}
      </ul>
    </div>
  );
}

function RankRows({ rows, showPct, showCat }: { rows: { name: string; v: number; cat?: string }[]; showPct?: boolean; showCat?: boolean }) {
  const max = Math.max(...rows.map((r) => r.v), 1);
  const total = rows.reduce((a, b) => a + b.v, 0);
  return rows.map((r) => (
    <div className={`barrow${showCat ? " barrow-cat" : ""}`} key={r.name}>
      <span title={r.name}>{r.name}</span>
      {showCat && <span className="cat" title={r.cat || ""}>{r.cat || "—"}</span>}
      <span className="bar-track"><i className="bar-fill" style={{ width: `${(r.v / max) * 100}%` }} /></span>
      <b>
        {nf.format(r.v)}
        {showPct && total > 0 && <span style={{ color: "#667381", fontWeight: 400 }}> · {Math.round((r.v / total) * 1000) / 10}%</span>}
      </b>
    </div>
  ));
}

function KpiCard({ label, value, meta, tag }: { label: string; value: string; meta: string; tag?: boolean }) {
  return (
    <article className="card kpi">
      <div className="label">{label}{tag && <span className="tag">F</span>}</div>
      <div className="value">{value}</div>
      <div className="meta">{meta}</div>
    </article>
  );
}

function LegendaFiltro() {
  return (
    <div style={{ gridColumn: "span 12", display: "flex", alignItems: "center", gap: 8, fontSize: 10.5, color: "#667381" }}>
      <span className="tag" style={{ marginLeft: 0 }}>F</span> Dados com filtro(s) aplicados
    </div>
  );
}

function DocumentsView({ active, filtros }: { active: boolean; filtros: FiltrosData | null }) {
  const [dias, setDias] = useState<"todos" | string>("todos");
  const [uf, setUf] = useState("");
  const [tipo, setTipo] = useState("");
  const [agruparPrincipio, setAgruparPrincipio] = useState(false);
  const { de, ate } = periodo(dias === "todos" ? "todos" : Number(dias));
  const qs = `de=${de}&ate=${ate}&uf=${uf}&tipo=${tipo}${agruparPrincipio ? "&agrupar=principio" : ""}`;
  const { data, erro, carregando } = useApi<DocsData>(`/api/dashboard/documentos?${qs}`, active);
  if (erro) return <div className="card" style={{ gridColumn: "span 12", color: "var(--red)" }}>Erro: {erro}</div>;
  if (!data) return <div className="card" style={{ gridColumn: "span 12", color: "#566271" }}>Carregando…</div>;
  const k = data.kpis;
  const prefixoMensal = data.serie_mensal.reduce<number[]>(
    (xs, s) => [...xs, (xs[xs.length - 1] ?? 0) + Number(s.emitidos)], []);
  const serieAcumulada = data.serie_mensal.map((s, i) => ({ x: s.mes, v: prefixoMensal[i] }));
  const mensal = data.serie_mensal.map((s) => Number(s.emitidos));
  const ultimo = data.serie_mensal[data.serie_mensal.length - 1];
  const [uy, um] = ultimo ? ultimo.mes.split("-") : ["", ""];
  const ultimoLabel = um ? `${MESES[Number(um) - 1]}/${String(uy).slice(2)}` : "—";
  const ORIGENS: { key: string; nome: string; cor: string; dash?: string }[] = [
    { key: "WEB", nome: "Web", cor: "#49e7ff" },
    { key: "WEB-MOBILE", nome: "Web mobile", cor: "#ffb454" },
    { key: "IOS", nome: "iOS", cor: "#f472b6", dash: "2 4" },
    { key: "ANDROID", nome: "Android", cor: "#34d399", dash: "10 4 2 4" },
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
  const totalVersao = data.totais_versao.reduce((a, v) => a + Number(v.documentos), 0);
  const pctVersao = (v: number) => (totalVersao > 0 ? `${((v / totalVersao) * 100).toFixed(1).replace(".", ",")}%` : "0,0%");
  const totalUf = data.por_uf.reduce((a, u) => a + Number(u.docs), 0);
  const pctUf = (v: number, t: number) => `${(t > 0 ? ((v / t) * 100).toFixed(1) : "0.0").replace(".", ",")}%`;
  const milUf = (v: number) => Math.round(v / 1000).toLocaleString("pt-BR");
  const totOrigem = new Map<string, number>();
  data.serie_origem.forEach((s) => totOrigem.set(s.origem, (totOrigem.get(s.origem) ?? 0) + Number(s.documentos)));
  const donutOrigem = ORIGENS
    .map((o) => ({ label: o.nome, v: totOrigem.get(o.key) ?? 0, cor: o.cor }))
    .filter((r) => r.v > 0);
  const filtrados = dias !== "todos" || uf !== "" || tipo !== "";
  const filtradosSemTipo = dias !== "todos" || uf !== "";
  return (
    <section className="grid">
      <div className="filters" style={{ gridColumn: "span 12" }}>
        <Sel label="Período" value={dias} onChange={setDias} options={PERIODOS} />
        <Sel label="UF" value={uf} onChange={setUf} options={[["", "Todas"], ...(filtros?.ufs.map((u) => [u, u] as [string, string]) ?? [])]} />
        <Sel label="Tipo" value={tipo} onChange={setTipo} options={[["", "Todos"], ...(filtros?.tipos.map((t) => [String(t.id), t.nome] as [string, string]) ?? [])]} />
        <div className="meta">{de} → {ate}</div>
      </div>
      {carregando && <Processando />}
      <KpiCard label="Emitidos" value={nf.format(k.emitidos)} meta="no período" tag={filtrados} />
      <KpiCard label="Assinados" value={nf.format(k.assinados)} meta="no período" tag={filtrados} />
      <KpiCard label="Não assinados" value={nf.format(k.nao_assinados)} meta="no período" tag={filtrados} />
      <KpiCard label="% Assinatura" value={`${k.pct_assinatura}%`} meta="assinados/emitidos" tag={filtrados} />
      <KpiCard label="Cancelados" value={nf.format(k.cancelados)} meta="no período" tag={filtrados} />

      <article className="card chart-main">
        <div className="section-title">
          <h2>Emissões por mês</h2>
          <div className="legend"><span><i className="l1" />Acumulado</span><span><i className="l2" />Mês (escala própria)</span>{filtrados && <span className="tag">F</span>}</div>
        </div>
        <div className="chart">
          <BarChart rows={serieAcumulada} bars={mensal} />
        </div>
        <div className="sub" style={{ marginTop: 4 }}>Total emitido em {ultimoLabel}: <b style={{ color: "var(--va)" }}>{nf.format(Number(ultimo?.emitidos ?? 0))}</b> · Acumulado: {nf.format(prefixoMensal[prefixoMensal.length - 1] ?? 0)}</div>
      </article>

      <article className="card side-chart">
        <div className="section-title"><h2>Distribuição por tipo</h2><span>{data.de.slice(0, 7)} → {data.ate.slice(0, 7)}{filtradosSemTipo && " · "}<span style={{ display: "inline" }}>{filtradosSemTipo && <span className="tag">F</span>}</span></span></div>
        <Donut rows={data.por_tipo.map((t) => ({ label: t.tipo, v: Number(t.docs) }))} />
      </article>

      <article className="card" style={{ gridColumn: "span 7" }}>
        <div className="section-title"><h2>Documentos emitidos por UF</h2>{filtrados && <span className="tag">F</span>}</div>
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
        <div className="section-title"><h2>Documentos por especialidade</h2>{filtradosSemTipo && <span className="tag">F</span>}</div>
        <RankRows showPct rows={data.ranking_especialidade.map((e) => ({ name: e.especialidade, v: Number(e.docs) }))} />
      </article>

      <article className="card" style={{ gridColumn: "span 8" }}>
        <div className="section-title">
          <h2>Emissões por plataforma</h2>
          <div className="legend">{seriesOrigem.map((s) => <span key={s.nome}><i style={{ background: s.cor, width: 18, height: 4, borderRadius: 2, alignSelf: "center" }} />{s.nome}</span>)}{filtradosSemTipo && <span className="tag">F</span>}</div>
        </div>
        <div className="chart">
          <LinesChart meses={mesesOrigem} series={seriesOrigem} />
        </div>
      </article>

      <article className="card side-chart">
        <div className="section-title">
          <h2>Participação por plataforma</h2>
          <span>{data.de.slice(0, 7)} → {data.ate.slice(0, 7)}{filtradosSemTipo && " · "}{filtradosSemTipo && <span className="tag">F</span>}</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: 230 }}>
          <Donut rows={donutOrigem} cores={donutOrigem.map((r) => r.cor)} agruparOutros={false} pctDec={1} />
        </div>
      </article>

      <article className="card" style={{ gridColumn: "span 5", display: "flex", flexDirection: "column" }}>
        <div className="section-title">
          <h2>Emissões por versão do app</h2>
          <span>{data.de.slice(0, 7)} → {data.ate.slice(0, 7)}{filtradosSemTipo && " · "}{filtradosSemTipo && <span className="tag">F</span>}</span>
        </div>
        <div className="uf-scroll" style={{ flexGrow: 1, flexShrink: 1, flexBasis: "auto", height: 0, minHeight: 200, overflowY: "auto" }}>
          <table className="table" style={{ fontSize: 10.5 }}>
            <thead><tr><th>Versão</th><th style={{ textAlign: "right" }}>Documentos</th><th style={{ textAlign: "right" }}>%</th></tr></thead>
            <tbody>
              {data.totais_versao.map((v) => (
                <tr key={v.versao}>
                  <td style={{ fontFamily: "ui-monospace, monospace" }}>{v.versao}</td>
                  <td style={{ textAlign: "right" }}>{nf.format(Number(v.documentos))}</td>
                  <td style={{ textAlign: "right" }}>{pctVersao(Number(v.documentos))}</td>
                </tr>
              ))}
              {data.totais_versao.length === 0 && (
                <tr><td colSpan={3} style={{ color: "#566271", textAlign: "center" }}>Sem dados no período/filtros.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </article>

      <article className="card" style={{ gridColumn: "span 7" }}>
        <div className="section-title">
          <h2>Medicamentos prescritos</h2>
          <label style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 10, color: "#8d99a7", cursor: "pointer", textTransform: "none", letterSpacing: 0 }}>
            <input type="checkbox" checked={agruparPrincipio} onChange={(e) => setAgruparPrincipio(e.target.checked)} style={{ accentColor: "var(--va)" }} />
            agrupar por princípio ativo
          </label>
          {filtrados && <span className="tag">F</span>}
        </div>
        <RankRows showCat rows={data.ranking_medicamentos.map((m) => ({ name: m.medicamento, v: Number(m.itens), cat: m.categoria }))} />
        {data.ranking_medicamentos.length === 0 && <div className="sub">Sem receitas no período/filtros.</div>}
      </article>

      <LegendaFiltro />
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
  const faixas = ["31-60", "61-90", "91-120", "120+"];
  const prefixoNovos = data.novos_mensal.reduce<number[]>(
    (xs, s) => [...xs, (xs[xs.length - 1] ?? 0) + Number(s.novos)], []);
  const novosAcumulados = data.novos_mensal.map((s, i) => ({ x: s.mes, v: prefixoNovos[i] }));
  const novosMensal = data.novos_mensal.map((s) => Number(s.novos));
  const totalInsc = data.por_uf.reduce((a, u) => a + Number(u.inscricoes_cadastradas), 0);
  const pctInsc = (v: number) => `${(totalInsc > 0 ? ((v / totalInsc) * 100).toFixed(1) : "0.0").replace(".", ",")}%`;
  const totalInat = data.inatividade.reduce((a, i) => a + Number(i.medicos), 0);
  const maxInat = Math.max(...data.inatividade.map((i) => Number(i.medicos)), 1);
  const INA_META: Record<string, { cor: string }> = {
    "31-60": { cor: "#a3e635" },
    "61-90": { cor: "var(--orange)" },
    "91-120": { cor: "#ff9f43" },
    "120+": { cor: "var(--red)" },
  };
  const ufFiltrada = uf !== "";
  const periodoFiltrado = dias !== "todos" || uf !== "";
  const valsEmissores = data.emissores_mensal.map((s) => Number(s.emissao));
  const mediaEmissores = valsEmissores.length >= 2
    ? Math.round((valsEmissores[valsEmissores.length - 1] - valsEmissores[0]) / (valsEmissores.length - 1))
    : null;
  const tendenciaEmissores = mediaEmissores === null
    ? null
    : mediaEmissores === 0
      ? <>Observa-se, ainda, uma variação média de <b style={{ color: "var(--va)" }}>{nf.format(0)}</b> médicos por mês na base de usuários.</>
      : <>Observa-se, ainda, um {mediaEmissores > 0 ? "crescimento" : "decréscimo"} médio de <b style={{ color: "var(--va)" }}>{nf.format(Math.abs(mediaEmissores))}</b> médicos por mês na base de usuários.</>;
  return (
    <section className="grid">
      <div className="filters" style={{ gridColumn: "span 12" }}>
        <Sel label="Período" value={dias} onChange={setDias} options={PERIODOS} />
        <Sel label="UF" value={uf} onChange={setUf} options={[["", "Todas"], ...(filtros?.ufs.map((u) => [u, u] as [string, string]) ?? [])]} />
        <div className="meta">snapshot na última carga · {de} → {ate}</div>
      </div>
      {carregando && <Processando />}
      <div style={{ gridColumn: "span 12", display: "grid", gridTemplateColumns: "repeat(12, 1fr)", gap: 14 }}>
        <KpiCard label="Inscrições cadastradas" value={nf.format(k.inscricoes)} meta="CRM/UF" tag={ufFiltrada} />
        <KpiCard label="MÉDICOS CADASTRADOS" value={nf.format(k.ativos)} meta="CPF" tag={ufFiltrada} />
        <KpiCard label="MÉDICOS ATIVOS (30 DIAS)" value={nf.format(data.emissores_30d)} meta="CPF com emissão" tag={ufFiltrada} />
      </div>

      <article className="card" style={{ gridColumn: "span 6" }}>
        <div className="section-title">
          <h2>Novos médicos por mês</h2>
          <div className="legend"><span><i className="l1" />Acumulado</span><span><i className="l2" />Mês</span>{ufFiltrada && <span className="tag">F</span>}</div>
        </div>
        <div className="chart">
          <BarChart rows={novosAcumulados} bars={novosMensal} tick={10} />
        </div>
        <div className="sub" style={{ marginTop: 4 }}>Novos médicos por mês · Acumulado: <b style={{ color: "var(--va)" }}>{nf.format(prefixoNovos[prefixoNovos.length - 1] ?? 0)}</b></div>
      </article>

      <article className="card" style={{ gridColumn: "span 6" }}>
        <div className="section-title">
          <h2>Médicos com pelo menos uma emissão de documento por mês</h2>
          <div className="legend"><span><i className="l1" />CPF distintos no mês</span>{periodoFiltrado && <span className="tag">F</span>}</div>
        </div>
        <div className="chart">
          <BarChart rows={data.emissores_mensal.map((s) => ({ x: s.mes, v: Number(s.emissao) }))} tick={10} labelCentralizado />
        </div>
        <div className="sub" style={{ marginTop: 4 }}>
          Nos últimos 30 dias, foram registrados <b style={{ color: "var(--va)" }}>{nf.format(data.emissores_30d)}</b> usuários ativos.{tendenciaEmissores && <> {tendenciaEmissores}</>}
        </div>
      </article>

      <article className="card" style={{ gridColumn: "span 7" }}>
        <div className="section-title"><h2>Médicos (CPF) por UF</h2><span>inscrições cadastradas (CRM/UF)</span></div>
        <div style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
          <div style={{ flex: 1.1, minWidth: 0 }}>
            <MapBr note={false} rows={data.por_uf.map((u) => ({ uf: u.uf, v: Number(u.inscricoes_cadastradas) }))} />
          </div>
          <div className="uf-scroll" style={{ flex: 1, maxHeight: 292, overflowY: "auto", paddingRight: 4 }}>
            <table className="table" style={{ fontSize: 10 }}>
              <thead><tr><th>UF</th><th style={{ textAlign: "right" }}>Inscrições</th><th style={{ textAlign: "right" }}>%</th></tr></thead>
              <tbody>
                {data.por_uf.map((u) => (
                  <tr key={u.uf}>
                    <td>{u.uf}</td>
                    <td style={{ textAlign: "right" }}>{nf.format(Number(u.inscricoes_cadastradas))}</td>
                    <td style={{ textAlign: "right" }}>{pctInsc(Number(u.inscricoes_cadastradas))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </article>

      <article className="card" style={{ gridColumn: "span 5" }}>
        <div className="section-title"><h2>Inatividade por faixa de tempo (CPF)</h2><span>dias desde a última emissão{ufFiltrada && " · "}{ufFiltrada && <span className="tag">F</span>}</span></div>
        <div style={{ paddingTop: 10, display: "flex", flexDirection: "column", gap: 14 }}>
          {faixas.map((f) => {
            const row = data.inatividade.find((i) => i.faixa === f);
            const v = row ? Number(row.medicos) : 0;
            const meta = INA_META[f];
            const pct = totalInat > 0 ? ((v / totalInat) * 100).toFixed(1).replace(".", ",") : "0,0";
            return (
              <div key={f}>
                <div style={{ display: "flex", alignItems: "baseline", fontSize: 10, color: "#8d99a7", marginBottom: 5 }}>
                  <span>{f} dias</span>
                  <b style={{ marginLeft: "auto", color: "#c3ccd6", fontSize: 10.5 }}>
                    {nf.format(v)}<span style={{ color: "#667381", fontWeight: 400 }}> · {pct}%</span>
                  </b>
                </div>
                <div className="bar-track">
                  <i className="bar-fill" style={{ width: `${maxInat > 0 ? (v / maxInat) * 100 : 0}%`, background: meta.cor }} />
                </div>
              </div>
            );
          })}
        </div>
      </article>
      <LegendaFiltro />
    </section>
  );
}

const ANOMALIAS: [string, string][] = [
  ["AN1", "AN1 · Emissões de documentos no período"],
  ["AN2", "AN2 · Atendimentos a pacientes distintos no período"],
  ["AN3", "AN3 · Maior volume diário de emissões a pacientes distintos no período"],
  ["AN4", "AN4 · Pacientes distintos por instituição no período"],
];

function AuditoriaView({ filtros }: { filtros: FiltrosData | null }) {
  const [anomalia, setAnomalia] = useState("AN1");
  const [dias, setDias] = useState<"todos" | string>("todos");
  const [uf, setUf] = useState("");
  const [tipo, setTipo] = useState("");
  const [limite, setLimite] = useState("20");
  const [data, setData] = useState<AudData | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(false);
  const [medico, setMedico] = useState<{ id_medico: number; nome: string } | null>(null);
  const [medicoData, setMedicoData] = useState<AudMedicoData | null>(null);
  const [medicoErro, setMedicoErro] = useState<string | null>(null);
  const [medicoCarregando, setMedicoCarregando] = useState(false);
  const [an3Selecionado, setAn3Selecionado] = useState<AudAn3Row | null>(null);
  const [an3Detalhe, setAn3Detalhe] = useState<AudAn3Detail | null>(null);
  const [an3Erro, setAn3Erro] = useState<string | null>(null);
  const [an3Carregando, setAn3Carregando] = useState(false);
  const [an4Selecionado, setAn4Selecionado] = useState<AudAn4Row | null>(null);
  const [an4Detalhe, setAn4Detalhe] = useState<AudAn4Detail | null>(null);
  const [an4Erro, setAn4Erro] = useState<string | null>(null);
  const [an4Carregando, setAn4Carregando] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const { de, ate } = periodo(dias === "todos" ? "todos" : Number(dias));

  const cancelar = () => {
    abortRef.current?.abort();
    abortRef.current = null;
    setCarregando(false);
  };

  const pesquisar = async () => {
    setAn3Selecionado(null);
    setAn3Detalhe(null);
    setAn3Erro(null);
    setAn4Selecionado(null);
    setAn4Detalhe(null);
    setAn4Erro(null);
    if (anomalia !== "AN1" && anomalia !== "AN2" && anomalia !== "AN3" && anomalia !== "AN4") { setData(null); setErro(null); return; }
    const semPeriodo = dias === "todos";
    const qs = `anomalia=${anomalia}${semPeriodo ? "" : `&de=${de}&ate=${ate}`}&uf=${uf}&tipo=${tipo}&limite=${limite}`;
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    setCarregando(true);
    setErro(null);
    try {
      const r = await fetch(`/api/dashboard/auditoria?${qs}`, { signal: ctrl.signal });
      const resultado = await r.json();
      if (!r.ok || resultado.erro) {
        setErro(resultado.erro ?? `HTTP ${r.status}`);
        setData(null);
      } else {
        setData(resultado);
      }
    } catch (e) {
      if ((e as Error).name === "AbortError") {
        setErro(null);
      } else {
        setErro(String(e));
      }
    } finally {
      if (abortRef.current === ctrl) {
        abortRef.current = null;
        setCarregando(false);
      }
    }
  };

  const abrirMedico = async (m: { id_medico: number; nome: string }) => {
    setAn3Selecionado(null);
    setAn3Detalhe(null);
    setAn3Erro(null);
    setAn4Selecionado(null);
    setAn4Detalhe(null);
    setAn4Erro(null);
    setMedico(m);
    setMedicoData(null);
    setMedicoErro(null);
    setMedicoCarregando(true);
    try {
      const r = await fetch(`/api/dashboard/auditoria/medico?id_medico=${m.id_medico}&anomalia=${anomalia}&de=${de}&ate=${ate}&uf=${uf}`);
      const j = await r.json();
      if (!r.ok || j.erro) { setMedicoErro(j.erro ?? `HTTP ${r.status}`); }
      else { setMedicoData(j); }
    } catch (e) {
      setMedicoErro(String(e));
    } finally {
      setMedicoCarregando(false);
    }
  };

  const abrirAn3 = async (row: AudAn3Row) => {
    setMedico(null);
    setMedicoData(null);
    setMedicoErro(null);
    setAn4Selecionado(null);
    setAn4Detalhe(null);
    setAn4Erro(null);
    setAn3Selecionado(row);
    setAn3Detalhe(null);
    setAn3Erro(null);
    setAn3Carregando(true);
    const qs = new URLSearchParams({
      anomalia: "AN3",
      id_medico: String(row.id_medico),
      dia: row.dia,
    });
    try {
      const r = await fetch(`/api/dashboard/auditoria/medico?${qs}`);
      const resultado = await r.json();
      if (!r.ok || resultado.erro) {
        setAn3Erro(resultado.erro ?? `HTTP ${r.status}`);
        setAn3Detalhe(null);
      } else {
        setAn3Detalhe(resultado);
      }
    } catch (e) {
      setAn3Erro(String(e));
    } finally {
      setAn3Carregando(false);
    }
  };

  const abrirAn4 = async (row: AudAn4Row) => {
    setMedico(null);
    setMedicoData(null);
    setMedicoErro(null);
    setAn3Selecionado(null);
    setAn3Detalhe(null);
    setAn3Erro(null);
    setAn4Selecionado(row);
    setAn4Detalhe(null);
    setAn4Erro(null);
    setAn4Carregando(true);
    const qs = new URLSearchParams({ chave: row.chave, de, ate });
    try {
      const r = await fetch(`/api/dashboard/auditoria/instituicao?${qs}`);
      const resultado = await r.json();
      if (!r.ok || resultado.erro) {
        setAn4Erro(resultado.erro ?? `HTTP ${r.status}`);
        setAn4Detalhe(null);
      } else {
        setAn4Detalhe(resultado);
      }
    } catch (e) {
      setAn4Erro(String(e));
    } finally {
      setAn4Carregando(false);
    }
  };

  return (
    <section className="grid">
      <div className="filters" style={{ gridColumn: "span 12" }}>
        <Sel label="Tipo de anomalia" value={anomalia} onChange={setAnomalia} options={ANOMALIAS} />
        <Sel label="Período" value={dias} onChange={setDias} options={[["todos", "Todos"], ["7", "7 dias"], ["30", "30 dias"], ["60", "60 dias"], ["90", "90 dias"], ["120", "120 dias"]]} />
        <Sel label="UF" value={uf} onChange={setUf} options={[["", "Todas"], ...(filtros?.ufs.map((u) => [u, u] as [string, string]) ?? [])]} />
        <Sel label="Tipo de documento" value={tipo} onChange={setTipo} options={[["", "Todos"], ...(filtros?.tipos.map((t) => [String(t.id), t.nome] as [string, string]) ?? [])]} />
        <label className="filter">
          Registros{" "}
          <select value={limite} onChange={(e) => setLimite(e.target.value)}>
            {["10", "20", "50", "100", "200"].map((v) => (
              <option key={v} value={v}>{v}</option>
            ))}
          </select>
        </label>
        <button className="btn primary" onClick={pesquisar} disabled={carregando}>Pesquisar</button>
        <div className="meta">{dias === "todos" ? "histórico completo" : `${de} → ${ate}`} · {anomalia}</div>
      </div>
      {carregando && <Processando onCancel={cancelar} />}
      {erro && <div className="card" style={{ gridColumn: "span 12", color: "var(--red)" }}>Erro: {erro}</div>}
      {!carregando && anomalia !== "AN1" && anomalia !== "AN2" && anomalia !== "AN3" && anomalia !== "AN4" && (
        <article className="card" style={{ gridColumn: "span 12" }}>
          <div className="section-title"><h2>{ANOMALIAS.find((a) => a[0] === anomalia)?.[1]}</h2><span>em breve</span></div>
          <div style={{ color: "#566271", fontSize: 12 }}>Esta anomalia será implementada em uma próxima etapa.</div>
        </article>
      )}
      {!carregando && anomalia === "AN3" && data && (
        <article className="card" style={{ gridColumn: "span 12" }}>
          <div className="section-title">
            <h2>AN3 · Maior volume diário de emissões a pacientes distintos no período</h2>
            <span>ordenado pelo maior volume de documentos em um único dia · limite {limite}</span>
          </div>
          <div className="uf-scroll" style={{ overflowX: "auto" }}>
            <table className="table">
              <thead>
                <tr>
                  <th>#</th><th>CRM</th><th>UF</th><th>Nome</th><th>Dia</th>
                  <th style={{ textAlign: "right" }}>Documentos no dia</th>
                  <th style={{ textAlign: "right" }}>Pacientes no dia</th>
                  <th style={{ textAlign: "right" }}>Detalhe</th>
                </tr>
              </thead>
              <tbody>
                {(data.an3 ?? []).map((r, i) => (
                  <tr key={r.id_medico}>
                    <td>{i + 1}</td>
                    <td>{r.crm}</td>
                    <td>{r.crm_uf ?? "—"}</td>
                    <td>{r.nome ?? "—"}</td>
                    <td>{r.dia}</td>
                    <td style={{ textAlign: "right", color: "var(--va)", fontWeight: 700 }}>{nf.format(Number(r.documentos))}</td>
                    <td style={{ textAlign: "right" }}>{nf.format(Number(r.pacientes))}</td>
                    <td style={{ textAlign: "right" }}>
                      <button
                        type="button"
                        className="drill-ico"
                        title="Detalhar o dia"
                        aria-label={`Detalhar o dia de ${r.nome ?? "médico"}`}
                        style={{ padding: 0, fontFamily: "inherit" }}
                        onClick={() => abrirAn3(r)}
                      >›</button>
                    </td>
                  </tr>
                ))}
                {(data.an3 ?? []).length === 0 && (
                  <tr><td colSpan={8} style={{ color: "#566271", textAlign: "center" }}>Sem registros no período/filtros.</td></tr>
                )}
              </tbody>
            </table>
          </div>
          <div className="sub" style={{ marginTop: 10, display: "grid", gap: 4 }}>
            <div><b>Documentos no dia:</b> total de documentos <b>assinados</b> emitidos pelo médico no dia de maior volume (Todos = melhor dia do histórico; 7/30/60/90/120 dias = melhor dia dentro da janela). <b>Detalhe:</b> abre o mix por tipo e a lista de documentos do dia (QR code, hora, tipo, instituição, UF e situação).</div>
            <div><b>Pacientes no dia:</b> pacientes distintos atendidos nesse mesmo dia.</div>
          </div>
        </article>
      )}
      {!carregando && anomalia === "AN4" && data && (
        <article className="card" style={{ gridColumn: "span 12" }}>
          <div className="section-title">
            <h2>AN4 · Pacientes distintos por instituição no período</h2>
            <span>ordenado pelo total de pacientes distintos · limite {limite}</span>
          </div>
          <div className="uf-scroll" style={{ overflowX: "auto" }}>
            <table className="table">
              <thead>
                <tr>
                  <th>#</th><th>Instituição</th><th>CNES</th><th>UF</th>
                  <th style={{ textAlign: "right" }}>Unidades</th>
                  <th style={{ textAlign: "right" }}>Médicos</th>
                  <th style={{ textAlign: "right" }}>Pacientes distintos</th>
                  <th style={{ textAlign: "right" }}>Detalhe</th>
                </tr>
              </thead>
              <tbody>
                {(data.an4 ?? []).map((r, i) => (
                  <tr key={r.chave}>
                    <td>{i + 1}</td>
                    <td>{r.instituicao}</td>
                    <td>{r.cnes ?? "—"}</td>
                    <td>{r.uf ?? "—"}</td>
                    <td style={{ textAlign: "right" }}>{nf.format(Number(r.unidades))}</td>
                    <td style={{ textAlign: "right" }}>{nf.format(Number(r.medicos))}</td>
                    <td style={{ textAlign: "right", color: "var(--va)", fontWeight: 700 }}>{nf.format(Number(r.pacientes))}</td>
                    <td style={{ textAlign: "right" }}>
                      <button
                        type="button"
                        className="drill-ico"
                        title="Detalhar a instituição"
                        aria-label={`Detalhar a instituição ${r.instituicao}`}
                        style={{ padding: 0, fontFamily: "inherit" }}
                        onClick={() => abrirAn4(r)}
                      >›</button>
                    </td>
                  </tr>
                ))}
                {(data.an4 ?? []).length === 0 && (
                  <tr><td colSpan={8} style={{ color: "#566271", textAlign: "center" }}>Sem registros no período/filtros.</td></tr>
                )}
              </tbody>
            </table>
          </div>
          <div className="sub" style={{ marginTop: 10, display: "grid", gap: 4 }}>
            <div><b>Instituição:</b> agrupamento pelo CNES da unidade; sem CNES, pela própria unidade de atendimento. <b>Unidades:</b> quantas unidades compõem o grupo. <b>Médicos:</b> vínculos ativos atuais (cadastro médico–unidade), não restritos ao período.</div>
            <div><b>Pacientes distintos:</b> pacientes diferentes que receberam documentos <b>assinados</b> no período (cada paciente conta uma vez na instituição). <b>Detalhe:</b> abre a evolução mensal e as unidades do grupo.</div>
          </div>
        </article>
      )}
      {!carregando && (anomalia === "AN1" || anomalia === "AN2") && data && (() => {
        const rows = anomalia === "AN1" ? (data.an1 ?? []) : (data.an2 ?? []);
        const metricTitle = anomalia === "AN1" ? "Documentos" : "Pacientes";
        const subtitle = anomalia === "AN1" ? "documentos no período por médico" : "pacientes distintos no período por médico";
        const getMetric = (r: typeof rows[number]) => anomalia === "AN1" ? Number((r as { docs: string }).docs) : Number((r as { pacientes: string }).pacientes);
        return (
        <article className="card" style={{ gridColumn: "span 12" }}>
          <div className="section-title"><h2>{anomalia === "AN1" ? "AN1 · Emissões de documentos no período" : "AN2 · Atendimentos a pacientes distintos no período"}</h2><span>{subtitle}</span></div>
          <table className="table">
            <thead>
              <tr>
                <th>#</th><th>CRM</th><th>UF</th><th>Nome</th>
                <th style={{ textAlign: "right" }}>{metricTitle}</th><th />
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={`${r.crm}-${r.crm_uf}-${i}`} onClick={() => abrirMedico({ id_medico: r.id_medico, nome: r.nome ?? "—" })} style={{ cursor: "pointer" }} className="drill-row">
                  <td>{i + 1}</td>
                  <td>{r.crm}</td>
                  <td>{r.crm_uf}</td>
                  <td>{r.nome ?? "—"}</td>
                  <td style={{ textAlign: "right" }}>{nf.format(getMetric(r))}</td>
                  <td style={{ textAlign: "right" }}>
                    <span className="drill-ico" title="Ver detalhes">›</span>
                  </td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr><td colSpan={6} style={{ color: "#566271", textAlign: "center" }}>Sem registros no período/filtros.</td></tr>
              )}
            </tbody>
          </table>
        </article>
        );
      })()}
      {medico && (
        <MedicoDrill medico={medico} anomalia={anomalia} data={medicoData} erro={medicoErro} carregando={medicoCarregando} onClose={() => setMedico(null)} />
      )}
      {an3Selecionado && (
        <An3Drill
          row={an3Selecionado}
          data={an3Detalhe}
          erro={an3Erro}
          carregando={an3Carregando}
          onClose={() => { setAn3Selecionado(null); setAn3Detalhe(null); setAn3Erro(null); }}
        />
      )}
      {an4Selecionado && (
        <An4Drill
          row={an4Selecionado}
          data={an4Detalhe}
          erro={an4Erro}
          carregando={an4Carregando}
          onClose={() => { setAn4Selecionado(null); setAn4Detalhe(null); setAn4Erro(null); }}
        />
      )}
    </section>
  );
}

function An3Drill({ row, data, erro, carregando, onClose }: {
  row: AudAn3Row;
  data: AudAn3Detail | null;
  erro: string | null;
  carregando: boolean;
  onClose: () => void;
}) {
  const maxTipo = Math.max(1, ...(data?.por_tipo ?? []).map((t) => Number(t.documentos)));
  return (
    <article className="card" style={{ gridColumn: "span 12" }}>
      <div className="section-title">
        <div>
          <h2>{row.nome ?? "Médico"}</h2>
          <span>CRM {data?.medico.crm ?? row.crm}/{data?.medico.crm_uf ?? row.crm_uf} · dia {data?.dia ?? row.dia}</span>
        </div>
        <button className="btn" onClick={onClose} style={{ padding: "4px 9px", fontSize: 10 }}>Fechar ✕</button>
      </div>
      {carregando && <div style={{ color: "#566271", fontSize: 12 }}>Carregando detalhamento…</div>}
      {erro && <div style={{ color: "var(--red)", fontSize: 12 }}>Erro: {erro}</div>}
      {!carregando && !erro && data && (
        <>
          <div className="sub" style={{ marginBottom: 10 }}>
            <b>{nf.format(Number(data.resumo.documentos))}</b> documentos assinados e <b>{nf.format(Number(data.resumo.pacientes))}</b> pacientes distintos nesse dia.
          </div>
          <div style={{ marginBottom: 12 }}>
            <div className="section-title" style={{ marginBottom: 6 }}><h2 style={{ fontSize: 12 }}>Por tipo de documento</h2></div>
            <table className="table" style={{ fontSize: 10.5 }}>
              <thead><tr><th>Documento</th><th style={{ textAlign: "right" }}>Docs</th><th style={{ width: "34%" }} /></tr></thead>
              <tbody>
                {data.por_tipo.map((t) => (
                  <tr key={t.tipo}>
                    <td>{t.tipo}</td>
                    <td style={{ textAlign: "right" }}>{nf.format(Number(t.documentos))}</td>
                    <td>
                      <div className="bar-track" style={{ height: 5 }}>
                        <i className="bar-fill" style={{ width: `${(Number(t.documentos) / maxTipo) * 100}%`, background: "var(--va)" }} />
                      </div>
                    </td>
                  </tr>
                ))}
                {data.por_tipo.length === 0 && (
                  <tr><td colSpan={3} style={{ color: "#566271", textAlign: "center" }}>Sem documentos no dia.</td></tr>
                )}
              </tbody>
            </table>
          </div>
          <div>
            <div className="section-title" style={{ marginBottom: 6 }}>
              <h2 style={{ fontSize: 12 }}>Documentos emitidos</h2>
              <span>{Number(data.resumo.documentos) > data.documentos.length ? `exibindo os ${nf.format(data.documentos.length)} primeiros` : "todos os documentos do dia"}</span>
            </div>
            <div className="uf-scroll" style={{ maxHeight: 320, overflowY: "auto" }}>
              <table className="table" style={{ fontSize: 10.5 }}>
                <thead>
                  <tr>
                    <th>#</th><th>QR code</th><th>Data/hora</th><th>Documento</th><th>Instituição</th><th>UF</th><th>Situação</th>
                  </tr>
                </thead>
                <tbody>
                  {data.documentos.map((d, i) => (
                    <tr key={`${d.ds_qrcode ?? "sem-qr"}-${i}`}>
                      <td>{i + 1}</td>
                      <td style={{ fontFamily: "ui-monospace, monospace", wordBreak: "break-all" }}>{d.ds_qrcode ?? "—"}</td>
                      <td>{d.data_hora}</td>
                      <td>{d.tipo}</td>
                      <td>{d.cnes ? `${d.instituicao} · CNES ${d.cnes}` : `${d.instituicao} · sem CNES`}</td>
                      <td>{d.uf}</td>
                      <td>{d.in_cancelado === "S" ? <span style={{ color: "var(--red)" }}>Cancelado</span> : d.in_assinado === "S" ? "Assinado" : "Não assinado"}</td>
                    </tr>
                  ))}
                  {data.documentos.length === 0 && (
                    <tr><td colSpan={7} style={{ color: "#566271", textAlign: "center" }}>Sem documentos no dia.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </article>
  );
}

function An4Drill({ row, data, erro, carregando, onClose }: {
  row: AudAn4Row;
  data: AudAn4Detail | null;
  erro: string | null;
  carregando: boolean;
  onClose: () => void;
}) {
  const serie = data ? data.serie_mensal.map((s) => ({ x: s.mes, v: Number(s.pacientes) })) : [];
  const mensal = data ? data.serie_mensal.map((s) => Number(s.pacientes)) : [];
  return (
    <article className="card" style={{ gridColumn: "span 12" }}>
      <div className="section-title">
        <h2>{data?.instituicao ?? row.instituicao}</h2>
        <span style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span>{data?.cnes ? `CNES ${data.cnes}` : "sem CNES"}{data?.uf ? ` · ${data.uf}` : ""}</span>
          <button className="btn" onClick={onClose} style={{ padding: "4px 9px", fontSize: 10 }}>Fechar ✕</button>
        </span>
      </div>
      {carregando && <Processando />}
      {erro && <div style={{ color: "var(--red)", fontSize: 12 }}>Erro: {erro}</div>}
      {!carregando && !erro && data && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(12, 1fr)", gap: 18 }}>
          <div style={{ gridColumn: "span 4" }}>
            <div className="section-title"><h2>Documentos por tipo</h2><span>assinados</span></div>
            <Donut rows={data.por_tipo.map((t) => ({ label: t.tipo, v: Number(t.documentos) }))} pctDec={1} />
            <div className="section-title" style={{ marginTop: 16 }}><h2>Unidades do grupo</h2><span>{nf.format(data.total_unidades)}</span></div>
            <div className="uf-scroll" style={{ maxHeight: 220, overflowY: "auto" }}>
              <table className="table" style={{ fontSize: 10.5 }}>
                <thead><tr><th>Unidade</th><th>UF</th><th style={{ textAlign: "right" }}>Pacientes</th></tr></thead>
                <tbody>
                  {data.unidades.map((u) => (
                    <tr key={u.id_unidade_atendimento}>
                      <td>{u.nome}</td>
                      <td>{u.uf}</td>
                      <td style={{ textAlign: "right" }}>{nf.format(Number(u.pacientes))}</td>
                    </tr>
                  ))}
                  {data.unidades.length === 0 && (
                    <tr><td colSpan={3} style={{ color: "#566271", textAlign: "center" }}>Sem unidades no período/filtros.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
          <div style={{ gridColumn: "span 8" }}>
            <div className="section-title"><h2>Pacientes distintos por mês</h2><span>mensal</span></div>
            <div className="chart" style={{ height: 210 }}>
              <BarChart rows={serie} bars={mensal} />
            </div>
            <div className="sub" style={{ marginTop: 14 }}>
              Total de pacientes distintos no período: <b style={{ color: "var(--va)" }}>{nf.format(Number(data.total_pacientes))}</b>
            </div>
          </div>
        </div>
      )}
    </article>
  );
}

function LogsView({ active }: { active: boolean }) {
  const [data, setData] = useState<LogsData | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(false);
  const [excluindo, setExcluindo] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    setCarregando(true);
    setErro(null);
    try {
      const r = await fetch("/api/admin/logs");
      const j = await r.json();
      if (!r.ok || j.erro) { setErro(j.erro ?? `HTTP ${r.status}`); }
      else { setData(j); }
    } catch (e) {
      setErro(String(e));
    } finally {
      setCarregando(false);
    }
  }, []);

  useEffect(() => {
    if (!active) return;
    const t = setTimeout(carregar, 0);
    return () => clearTimeout(t);
  }, [active, carregar]);

  const excluir = async (alvo: string) => {
    setExcluindo(alvo);
    try {
      await fetch("/api/admin/logs/clear", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ alvo }),
      });
      await carregar();
    } catch (e) {
      setErro(String(e));
    } finally {
      setExcluindo(null);
    }
  };

  const fmtDataHora = (v: string | null) => (v ? new Date(v).toLocaleString("pt-BR") : "—");

  return (
    <section className="grid">
      {carregando && <Processando />}
      {erro && <div className="card" style={{ gridColumn: "span 12", color: "var(--red)" }}>Erro: {erro}</div>}

      <article className="card" style={{ gridColumn: "span 6" }}>
        <div className="section-title">
          <h2>Log de utilização (logins)</h2>
          <button className="btn" onClick={() => excluir("acessos")} disabled={excluindo !== null} style={{ padding: "4px 9px", fontSize: 10, color: "var(--red)", borderColor: "rgba(255,100,124,.35)" }}>
            {excluindo === "acessos" ? "…" : "Excluir log"}
          </button>
        </div>
        <div className="uf-scroll" style={{ maxHeight: 460, overflowY: "auto" }}>
          <table className="table" style={{ fontSize: 10.5 }}>
            <thead><tr><th>Data/hora</th><th>E-mail</th><th>IP</th><th>Resultado</th></tr></thead>
            <tbody>
              {data?.acessos.map((a) => (
                <tr key={a.id_access_log}>
                  <td>{fmtDataHora(a.dh_evento)}</td>
                  <td>{a.nm_email}</td>
                  <td>{a.tx_ip ?? "—"}</td>
                  <td><span className={`badge ${a.in_sucesso ? "ok" : "bad"}`}>{a.in_sucesso ? "sucesso" : "negado"}</span></td>
                </tr>
              ))}
              {data && data.acessos.length === 0 && (
                <tr><td colSpan={4} style={{ color: "#566271", textAlign: "center" }}>Sem registros.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </article>

      <article className="card" style={{ gridColumn: "span 6" }}>
        <div className="section-title">
          <h2>Log de atualizações</h2>
          <button className="btn" onClick={() => excluir("jobs")} disabled={excluindo !== null} style={{ padding: "4px 9px", fontSize: 10, color: "var(--red)", borderColor: "rgba(255,100,124,.35)" }}>
            {excluindo === "jobs" ? "…" : "Excluir log"}
          </button>
        </div>
        <div className="uf-scroll" style={{ maxHeight: 460, overflowY: "auto" }}>
          <table className="table" style={{ fontSize: 10.5 }}>
            <thead><tr><th>Início</th><th>Tipo</th><th>Solicitado por</th><th>Status</th><th>Duração</th></tr></thead>
            <tbody>
              {data?.jobs.map((j) => {
                const dur = j.iniciado_em && j.finalizado_em
                  ? Math.max(0, Math.round((new Date(j.finalizado_em).getTime() - new Date(j.iniciado_em).getTime()) / 1000))
                  : null;
                return (
                  <tr key={j.id_job}>
                    <td>{fmtDataHora(j.iniciado_em)}</td>
                    <td>{j.tipo === "manual" ? "manual" : "programado"}</td>
                    <td>{j.solicitado_por ?? "—"}</td>
                    <td><span className={`badge ${j.status === "success" ? "ok" : j.status === "failed" ? "bad" : "warn"}`}>{STATUS_PT[j.status] ?? j.status}</span></td>
                    <td>{dur !== null ? `${Math.floor(dur / 60)}m ${dur % 60}s` : "—"}</td>
                  </tr>
                );
              })}
              {data && data.jobs.length === 0 && (
                <tr><td colSpan={5} style={{ color: "#566271", textAlign: "center" }}>Sem registros.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </article>
    </section>
  );
}

function MedicoDrill({ medico, anomalia, data, erro, carregando, onClose }: {
  medico: { id_medico: number; nome: string };
  anomalia: string;
  data: AudMedicoData | null;
  erro: string | null;
  carregando: boolean;
  onClose: () => void;
}) {
  const isAn2 = anomalia === "AN2";
  const total = isAn2
    ? (data?.total_pacientes ?? 0)
    : (data ? data.por_tipo.reduce((a, t) => a + Number(t.docs), 0) : 0);
  let acumulado = 0;
  const serie = data ? data.serie_mensal.map((s) => {
    if (isAn2) return { x: s.mes, v: Number(s.docs) };
    acumulado += Number(s.docs);
    return { x: s.mes, v: acumulado };
  }) : [];
  const mensal = isAn2 ? undefined : (data ? data.serie_mensal.map((s) => Number(s.docs)) : []);
  const situacaoLabel = data?.medico?.situacao ? `Situação ${data.medico.situacao}` : null;
  const inscricaoLabel = data?.medico?.tipo_inscricao ? `Inscrição ${data.medico.tipo_inscricao}` : null;

  return (
    <article className="card" style={{ gridColumn: "span 12" }}>
      <div className="section-title">
        <h2>{medico.nome}</h2>
        <span style={{ display: "flex", alignItems: "center", gap: 10 }}>
          {data?.medico && <span>CRM {data.medico.crm}/{data.medico.crm_uf}</span>}
          <button className="btn" onClick={onClose} style={{ padding: "4px 9px", fontSize: 10 }}>Fechar ✕</button>
        </span>
      </div>
      {carregando && <Processando />}
      {erro && <div style={{ color: "var(--red)" }}>Erro: {erro}</div>}
      {!carregando && !erro && data && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(12, 1fr)", gap: 18 }}>
          {!isAn2 && (
            <div style={{ gridColumn: "span 4" }}>
              <div className="section-title"><h2>Documentos por tipo</h2></div>
              <Donut rows={data.por_tipo.map((t) => ({ label: t.tipo, v: Number(t.docs) }))} pctDec={1} />
              <div style={{ marginTop: 12, display: "flex", gap: 8, flexWrap: "wrap" }}>
                {situacaoLabel && <span className="badge ok">{situacaoLabel}</span>}
                {inscricaoLabel && <span className="badge warn">{inscricaoLabel}</span>}
              </div>
            </div>
          )}
          <div style={{ gridColumn: isAn2 ? "span 12" : "span 8" }}>
            <div className="section-title">
              <h2>{isAn2 ? "Pacientes distintos por mês" : "Evolução mensal"}</h2>
              <span>{isAn2 ? "pacientes distintos" : "acumulado × mês"}</span>
            </div>
            <div className="chart" style={{ height: 210 }}>
              <BarChart rows={serie} bars={mensal} />
            </div>
            {isAn2 && (
              <div style={{ marginTop: 10, display: "flex", gap: 8, flexWrap: "wrap" }}>
                {situacaoLabel && <span className="badge ok">{situacaoLabel}</span>}
                {inscricaoLabel && <span className="badge warn">{inscricaoLabel}</span>}
              </div>
            )}
            <div style={{ marginTop: 10 }}>
              <div className="section-title"><h2>Especialidades</h2></div>
              {data.especialidades.length > 0 ? (
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  {data.especialidades.map((e) => (
                    <span key={e} className="badge">{e}</span>
                  ))}
                </div>
              ) : (
                <div style={{ color: "#566271", fontSize: 11 }}>Sem especialidade cadastrada.</div>
              )}
            </div>
            <div className="sub" style={{ marginTop: 14 }}>
              {isAn2
                ? <>Total de pacientes distintos no período: <b style={{ color: "var(--va)" }}>{nf.format(total)}</b></>
                : <>Total no período: <b style={{ color: "var(--va)" }}>{nf.format(total)}</b> documentos · {data.por_tipo.length} tipos distintos</>}
            </div>
          </div>
        </div>
      )}
    </article>
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
    const t = setTimeout(loadHealth, 0);
    const id = setInterval(loadHealth, 30000);
    return () => { clearTimeout(t); clearInterval(id); };
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
        {email === ADMIN_EMAIL && (
          <button className={`tab ${view === "logs" ? "active" : ""}`} data-view="logs" onClick={() => setView("logs")}>
            {VIEW_META.logs.title}
          </button>
        )}
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
            {v === "auditoria" && <AuditoriaView filtros={filtros} />}
          </section>
        ))}
        {email === ADMIN_EMAIL && (
          <section className={`view theme-cyan ${view === "logs" ? "active" : ""}`}>
            <header className="topbar">
              <div>
                <div className="eyebrow">VISÃO</div>
                <h1>Logs</h1>
                <div className="subtitle">Utilização (logins) e atualizações de dados — visão administrativa.</div>
              </div>
            </header>
            <LogsView active={view === "logs"} />
          </section>
        )}
        <div className="footer">
          <span>PE Dashboard · CFM v1.4</span>
          <span>Datamart prescricao_dw · última carga: {health?.job?.finalizado_em ? new Date(health.job.finalizado_em).toLocaleString("pt-BR") : "—"}</span>
        </div>
      </main>
    </>
  );
}
