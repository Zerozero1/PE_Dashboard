"use client";

import { useCallback, useEffect, useState } from "react";

const nf = new Intl.NumberFormat("pt-BR");

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
  serie_mensal: { mes: string; emitidos: string; assinados: string }[];
  por_tipo: { tipo: string; docs: string }[];
  por_uf: { uf: string; docs: string }[];
  ranking_especialidade: { especialidade: string; docs: string }[];
  tabela_uf_tipo: { uf: string; tipo: string; emitidos: string; assinados: string; pct: number; cancelados: string }[];
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

const VIEWS = ["documentos", "medicos", "dispensacoes", "auditoria"] as const;
type ViewId = (typeof VIEWS)[number];

const VIEW_META: Record<ViewId, { title: string; subtitle: string; theme: string }> = {
  documentos: { title: "Documentos médicos", subtitle: "Emissões por período, UF, tipo e especialidade — UF da unidade de atendimento.", theme: "theme-cyan" },
  medicos: { title: "Médicos", subtitle: "Cadastro, situação da inscrição e atividade de prescrição por UF.", theme: "theme-blue" },
  dispensacoes: { title: "Dispensações", subtitle: "Dispensação de receitas por farmácia e farmacêutico — UF do CRF.", theme: "theme-green" },
  auditoria: { title: "Auditoria", subtitle: "Anomalias agregadas — média de referência de todos os médicos · somente agregados.", theme: "theme-red" },
};

const UF_POS: Record<string, [number, number]> = {
  SP: [325, 152], RJ: [365, 158], MG: [345, 133], ES: [375, 140], PR: [295, 168],
  SC: [290, 180], RS: [270, 192], BA: [385, 118], SE: [420, 105], AL: [430, 98],
  PE: [435, 88], PB: [445, 80], RN: [445, 72], CE: [415, 72], PI: [390, 92],
  MA: [380, 95], PA: [330, 78], AP: [330, 60], AM: [225, 85], RR: [225, 48],
  AC: [160, 100], RO: [195, 105], MT: [250, 115], MS: [255, 145], GO: [310, 125],
  DF: [322, 122], TO: [345, 100],
};

function useApi<T>(path: string, active: boolean) {
  const [data, setData] = useState<T | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  useEffect(() => {
    if (!active) return;
    let ok = true;
    setErro(null);
    fetch(path)
      .then((r) => r.json())
      .then((d) => { if (ok) setData(d); })
      .catch((e) => { if (ok) setErro(String(e)); });
    return () => { ok = false; };
  }, [path, active]);
  return { data, erro };
}

function BarChart({ rows, w = 800, h = 220 }: { rows: { x: string; v: number; v2?: number }[]; w?: number; h?: number }) {
  const max = Math.max(...rows.map((r) => Math.max(r.v, r.v2 ?? 0)), 1);
  const pad = 26;
  const iw = w - pad;
  const step = rows.length > 1 ? iw / (rows.length - 1) : 0;
  const pts = rows.map((r, i) => `${pad + i * step},${h - (r.v / max) * (h - 30)}`).join(" ");
  const pts2 = rows.filter((r) => r.v2 !== undefined).map((r, i) => `${pad + i * step},${h - ((r.v2 ?? 0) / max) * (h - 30)}`).join(" ");
  return (
    <svg viewBox={`0 0 ${w} ${h + 24}`} preserveAspectRatio="none" style={{ width: "100%", height: "100%" }}>
      <polyline fill="none" stroke="var(--va)" strokeWidth="3" points={pts} />
      {pts2 && <polyline fill="none" stroke="var(--va2)" strokeWidth="2" strokeDasharray="5 5" points={pts2} />}
      {rows.slice(-1).map((r, i) => (
        <circle key={i} cx={pad + (rows.length - 1) * step} cy={h - (r.v / max) * (h - 30)} r="4" fill="var(--va)" />
      ))}
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
  const cores = ["var(--va)", "var(--va2)", "#394452", "#2a3543", "#243041"];
  let acc = 0;
  const stops = rows.map((r, i) => {
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
            <strong style={{ fontSize: 18 }}>{nf.format(total)}</strong>
            <div style={{ color: "#6f7b88", fontSize: 9, textTransform: "uppercase", letterSpacing: ".1em" }}>documentos</div>
          </div>
        </div>
      </div>
      <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
        {rows.slice(0, 5).map((r, i) => (
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

function MapBr({ rows }: { rows: { uf: string; v: number }[] }) {
  const max = Math.max(...rows.map((r) => r.v), 1);
  const items = rows.filter((r) => UF_POS[r.uf]);
  return (
    <div className="map-box">
      <svg viewBox="0 0 700 250" preserveAspectRatio="none">
        <path d="M240 30 L300 18 L370 24 L430 40 L470 62 L505 88 L520 118 L505 150 L535 180 L560 200 L520 218 L470 226 L420 230 L370 222 L320 210 L280 190 L250 168 L230 140 L220 112 L222 86 L226 58 Z" fill="#0d121a" stroke="#202936" strokeWidth="1.2" />
        {items.map((r) => {
          const [x, y] = UF_POS[r.uf];
          const radius = 6 + (r.v / max) * 26;
          return <circle key={r.uf} cx={x} cy={y} r={radius} fill="var(--va)" opacity=".5" />;
        })}
      </svg>
      <div className="map-note">{rows.slice(0, 4).map((r) => `${r.uf} ${nf.format(r.v)}`).join(" · ")}</div>
    </div>
  );
}

function RankRows({ rows }: { rows: { name: string; v: number }[] }) {
  const max = Math.max(...rows.map((r) => r.v), 1);
  return rows.map((r) => (
    <div className="barrow" key={r.name}>
      <span>{r.name}</span>
      <span className="bar-track"><i className="bar-fill" style={{ width: `${(r.v / max) * 100}%` }} /></span>
      <b>{nf.format(r.v)}</b>
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

function DocumentsView({ active }: { active: boolean }) {
  const { data, erro } = useApi<DocsData>("/api/dashboard/documentos", active);
  if (erro) return <div className="card" style={{ gridColumn: "span 12", color: "var(--red)" }}>Erro: {erro}</div>;
  if (!data) return <div className="card" style={{ gridColumn: "span 12", color: "#566271" }}>Carregando…</div>;
  const k = data.kpis;
  return (
    <section className="grid">
      <KpiCard label="Emitidos" value={nf.format(k.emitidos)} meta="no período" />
      <KpiCard label="Assinados" value={nf.format(k.assinados)} meta="no período" />
      <KpiCard label="Não assinados" value={nf.format(k.nao_assinados)} meta="no período" />
      <KpiCard label="% Assinatura" value={`${k.pct_assinatura}%`} meta="assinados/emitidos" />
      <KpiCard label="Cancelados" value={nf.format(k.cancelados)} meta="no período" />
      <KpiCard label="Pacientes distintos" value={nf.format(k.pacientes)} meta="no período" />

      <article className="card chart-main">
        <div className="section-title"><h2>Emissões por mês</h2><div className="legend"><span><i className="l1" />Emitidos</span><span><i className="l2" />Assinados</span></div></div>
        <div className="chart">
          <BarChart rows={data.serie_mensal.map((s) => ({ x: s.mes, v: Number(s.emitidos), v2: Number(s.assinados) }))} />
        </div>
      </article>

      <article className="card side-chart">
        <div className="section-title"><h2>Distribuição por tipo</h2><span>{data.de.slice(0, 7)} → {data.ate.slice(0, 7)}</span></div>
        <Donut rows={data.por_tipo.map((t) => ({ label: t.tipo, v: Number(t.docs) }))} />
      </article>

      <article className="card" style={{ gridColumn: "span 7" }}>
        <div className="section-title"><h2>Documentos emitidos por UF</h2><span>UF da unidade de atendimento</span></div>
        <MapBr rows={data.por_uf.map((u) => ({ uf: u.uf, v: Number(u.docs) }))} />
      </article>

      <article className="card" style={{ gridColumn: "span 5" }}>
        <div className="section-title"><h2>Documentos por especialidade</h2><span>ranking</span></div>
        <RankRows rows={data.ranking_especialidade.map((e) => ({ name: e.especialidade, v: Number(e.docs) }))} />
      </article>

      <article className="card" style={{ gridColumn: "span 12" }}>
        <div className="section-title"><h2>Distribuição UF → tipo de documento</h2><span>tabela hierárquica · top 100</span></div>
        <table className="table">
          <thead><tr><th>UF</th><th>Tipo de documento</th><th>Emitidos</th><th>Assinados</th><th>% Assin.</th><th>Cancelados</th></tr></thead>
          <tbody>
            {data.tabela_uf_tipo.map((r, i) => (
              <tr key={i}>
                <td>{r.uf}</td><td>{r.tipo}</td>
                <td>{nf.format(Number(r.emitidos))}</td>
                <td>{nf.format(Number(r.assinados))}</td>
                <td>{r.pct}%</td><td>{nf.format(Number(r.cancelados))}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </article>
    </section>
  );
}

function MedicosView({ active }: { active: boolean }) {
  const { data, erro } = useApi<MedData>("/api/dashboard/medicos", active);
  if (erro) return <div className="card" style={{ gridColumn: "span 12", color: "var(--red)" }}>Erro: {erro}</div>;
  if (!data) return <div className="card" style={{ gridColumn: "span 12", color: "#566271" }}>Carregando…</div>;
  const k = data.kpis;
  const faixas = ["0-30", "31-60", "61-90", "91-120", "120+"];
  return (
    <section className="grid">
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

function DispensacoesView({ active }: { active: boolean }) {
  const { data, erro } = useApi<DispData>("/api/dashboard/dispensacoes", active);
  if (erro) return <div className="card" style={{ gridColumn: "span 12", color: "var(--red)" }}>Erro: {erro}</div>;
  if (!data) return <div className="card" style={{ gridColumn: "span 12", color: "#566271" }}>Carregando…</div>;
  const k = data.kpis;
  return (
    <section className="grid">
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
  const { data, erro } = useApi<AudData>("/api/dashboard/auditoria", active);
  if (erro) return <div className="card" style={{ gridColumn: "span 12", color: "var(--red)" }}>Erro: {erro}</div>;
  if (!data) return <div className="card" style={{ gridColumn: "span 12", color: "#566271" }}>Carregando…</div>;
  return (
    <section className="grid">
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

export default function Dashboard({ email, mock }: { email: string; mock?: boolean }) {
  const [view, setView] = useState<ViewId>("documentos");
  const [health, setHealth] = useState<Health | null>(null);
  const [btn, setBtn] = useState("Atualizar dados");

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
          <div className="brand-mark">PE</div>
          <div><strong>Prescrição</strong><span>Eletrônica CFM</span></div>
        </div>
        <div className="top-right">
          <span className={`chip ${chipCls}`}>
            <i className={`dot ${job?.status === "failed" ? "bad" : ""}`} />
            Carga <b>{job ? job.status : "—"}</b>
          </span>
          <span className="chip">Dados <b>{dadosDia ? new Date(dadosDia).toLocaleDateString("pt-BR") : "—"}</b></span>
          <button className="btn primary" onClick={refresh} disabled={btn !== "Atualizar dados"}>{btn}</button>
          <span className="chip">{mock ? "DEV" : email}</span>
        </div>
      </header>

      <nav className="tabs">
        {VIEWS.map((v) => (
          <button key={v} className={`tab ${view === v ? "active" : ""}`} data-view={v} onClick={() => setView(v)}>
            {v === "documentos" && "⌂"}{v === "medicos" && "◈"}{v === "dispensacoes" && "⌁"}{v === "auditoria" && "△"}
            {VIEW_META[v].title}
          </button>
        ))}
      </nav>

      <main className="main">
        {VIEWS.map((v) => (
          <section key={v} className={`view ${VIEW_META[v].theme} ${view === v ? "active" : ""}`}>
            <header className="topbar">
              <div>
                <div className="eyebrow">Painel operacional · PE</div>
                <h1>{VIEW_META[v].title}</h1>
                <div className="subtitle">{VIEW_META[v].subtitle}</div>
              </div>
            </header>
            {v === "documentos" && <DocumentsView active={view === v} />}
            {v === "medicos" && <MedicosView active={view === v} />}
            {v === "dispensacoes" && <DispensacoesView active={view === v} />}
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
