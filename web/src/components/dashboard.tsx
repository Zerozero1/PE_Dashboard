"use client";

import { useCallback, useEffect, useState } from "react";

type Health = {
  status: string;
  job: {
    id_job: number;
    tipo: string;
    status: string;
    solicitado_por: string | null;
    iniciado_em: string | null;
    finalizado_em: string | null;
    mensagem: string | null;
  } | null;
  config: { horario_diario: string; timezone: string; ativo: boolean } | null;
  dados: { ultimo_dia: string | null; total: string | null } | null;
};

const VIEWS = ["documentos", "medicos", "dispensacoes", "auditoria"] as const;
type ViewId = (typeof VIEWS)[number];

const VIEW_META: Record<ViewId, { title: string; subtitle: string; theme: string }> = {
  documentos: {
    title: "Documentos médicos",
    subtitle: "Emissões por período, UF, tipo de documento e especialidade — UF da unidade de atendimento.",
    theme: "theme-cyan",
  },
  medicos: {
    title: "Médicos",
    subtitle: "Cadastro, situação da inscrição e atividade de prescrição por UF e especialidade.",
    theme: "theme-blue",
  },
  dispensacoes: {
    title: "Dispensações",
    subtitle: "Dispensação de receitas por farmácia e farmacêutico — UF do CRF do farmacêutico.",
    theme: "theme-green",
  },
  auditoria: {
    title: "Auditoria",
    subtitle: "Anomalias agregadas do datamart — média de referência de todos os médicos · somente agregados.",
    theme: "theme-red",
  },
};

function Kpi({ label, meta }: { label: string; meta: string }) {
  return (
    <article className="card kpi">
      <div className="label">{label}</div>
      <div className="value placeholder">--</div>
      <div className="meta">{meta}</div>
      <div className="spark">
        <svg viewBox="0 0 76 32">
          <polyline fill="none" style={{ stroke: "var(--va)" }} strokeWidth="2" points="0,26 13,22 25,24 37,16 49,18 60,11 76,6" />
        </svg>
      </div>
    </article>
  );
}

function MapCard({ span, note }: { span: number; note: string }) {
  return (
    <article className="card" style={{ gridColumn: `span ${span}` }}>
      <div className="section-title">
        <h2>Mapa por UF</h2>
        <span>bolhas proporcionais</span>
      </div>
      <div className="map-box">
        <svg viewBox="0 0 700 250" preserveAspectRatio="none">
          <path
            d="M240 30 L300 18 L370 24 L430 40 L470 62 L505 88 L520 118 L505 150 L535 180 L560 200 L520 218 L470 226 L420 230 L370 222 L320 210 L280 190 L250 168 L230 140 L220 112 L222 86 L226 58 Z"
            fill="#0d121a" stroke="#202936" strokeWidth="1.2"
          />
        </svg>
        <div className="map-note">{note}</div>
      </div>
    </article>
  );
}

function RankCard({ span, items }: { span: number; items: [string, string][] }) {
  const max = Math.max(...items.map(([, v]) => parseFloat(v.replace(/\D/g, "")) || 0), 1);
  return (
    <article className="card" style={{ gridColumn: `span ${span}` }}>
      <div className="section-title">
        <h2>Ranking</h2>
        <span>top {items.length}</span>
      </div>
      {items.map(([name, val]) => {
        const num = parseFloat(val.replace(/\D/g, "")) || 0;
        return (
          <div className="barrow" key={name}>
            <span>{name}</span>
            <span className="bar-track">
              <i className="bar-fill" style={{ width: `${(num / max) * 100}%` }} />
            </span>
            <b>{val}</b>
          </div>
        );
      })}
    </article>
  );
}

function DocumentsView() {
  return (
    <section className="grid">
      <Kpi label="Emitidos" meta="vs anterior" />
      <Kpi label="Assinados" meta="% das emissões" />
      <Kpi label="Não assinados" meta="no mês" />
      <Kpi label="% Assinatura" meta="evolução" />
      <Kpi label="Cancelados" meta="% das emissões" />
      <Kpi label="Pacientes distintos" meta="vs anterior" />

      <article className="card chart-main">
        <div className="section-title">
          <h2>Emissões por mês</h2>
          <div className="legend"><span><i className="l1" />Emitidos</span><span><i className="l2" />Assinados</span></div>
        </div>
        <div className="chart"><div className="gridlines" /></div>
      </article>

      <article className="card side-chart">
        <div className="section-title"><h2>Distribuição por tipo</h2><span>últimos 30 dias</span></div>
        <div className="donut-wrap">
          <div className="donut" style={{ background: "conic-gradient(var(--va) 0 100%,#1a2530 0)" }} />
          <div className="donut-center"><strong className="placeholder">--</strong><span>documentos</span></div>
        </div>
      </article>

      <MapCard span={7} note="dados em breve — Fase 3" />
      <RankCard span={5} items={[["Clínica médica", "--"], ["Pediatria", "--"], ["Ginecologia", "--"], ["Cardiologia", "--"], ["Ortopedia", "--"]]} />

      <article className="card" style={{ gridColumn: "span 12" }}>
        <div className="section-title"><h2>Distribuição UF → tipo de documento</h2><span>tabela hierárquica</span></div>
        <table className="table">
          <thead><tr><th>UF</th><th>Tipo de documento</th><th>Emitidos</th><th>Assinados</th><th>% Assin.</th><th>Cancelados</th></tr></thead>
          <tbody>
            <tr><td colSpan={6} style={{ color: "#566271" }}>dados em breve — Fase 3</td></tr>
          </tbody>
        </table>
      </article>
    </section>
  );
}

function MedicosView() {
  return (
    <section className="grid">
      <Kpi label="Inscrições cadastradas" meta="registros CRM/UF" />
      <Kpi label="Médicos cadastrados" meta="no mês" />
      <Kpi label="Médicos ativos" meta="in_situacao = A" />
      <Kpi label="Inscrições ativas" meta="% do cadastro" />
      <Kpi label="Emissões no período" meta="médicos distintos" />
      <Kpi label="Novos no mês" meta="proxy dh_atualizacao" />

      <article className="card chart-main">
        <div className="section-title"><h2>Total acumulado de médicos</h2><div className="legend"><span><i className="l1" />Acumulado</span></div></div>
        <div className="chart"><div className="gridlines" /></div>
      </article>
      <article className="card side-chart">
        <div className="section-title"><h2>Novos médicos por mês</h2><span>proxy: dh_atualizacao</span></div>
        <div className="chart"><div className="gridlines" /></div>
      </article>

      <MapCard span={7} note="dados em breve — Fase 3" />
      <RankCard span={5} items={[["São Paulo", "--"], ["Rio de Janeiro", "--"], ["Minas Gerais", "--"], ["Paraná", "--"], ["Bahia", "--"]]} />

      <article className="card" style={{ gridColumn: "span 12" }}>
        <div className="section-title"><h2>Inatividade por faixa de dias sem emissão</h2><span>30/60/90/120 dias</span></div>
        <table className="table">
          <thead><tr><th>Faixa</th><th>Médicos</th><th>% dos ativos</th><th>Status</th></tr></thead>
          <tbody>
            {["30 – 60 dias", "61 – 90 dias", "91 – 120 dias", "Mais de 120 dias"].map((f) => (
              <tr key={f}><td>{f}</td><td className="placeholder">--</td><td className="placeholder">--</td><td><span className="badge warn">—</span></td></tr>
            ))}
          </tbody>
        </table>
      </article>
    </section>
  );
}

function DispensacoesView() {
  return (
    <section className="grid">
      <Kpi label="Dispensações" meta="vs anterior" />
      <Kpi label="Assinadas" meta="in_assinado = S" />
      <Kpi label="Canceladas" meta="status C" />
      <Kpi label="Farmacêuticos" meta="cadastrados" />
      <Kpi label="Farmácias" meta="pessoas tipo F" />
      <Kpi label="Pacientes distintos" meta="vs anterior" />

      <article className="card chart-main">
        <div className="section-title"><h2>Dispensações por mês</h2><div className="legend"><span><i className="l1" />Acumuladas</span><span><i className="l2" />Novas</span></div></div>
        <div className="chart"><div className="gridlines" /></div>
      </article>
      <article className="card side-chart">
        <div className="section-title"><h2>Farmacêuticos</h2><span>acumulados e novos</span></div>
        <div className="chart"><div className="gridlines" /></div>
      </article>

      <MapCard span={7} note="UF do CRF — dados em breve" />
      <article className="card" style={{ gridColumn: "span 5" }}>
        <div className="section-title"><h2>Totais e assinadas por UF</h2><span>assinatura única</span></div>
        <table className="table">
          <thead><tr><th>UF</th><th>Dispensações</th><th>Assinadas</th><th>% Assin.</th></tr></thead>
          <tbody><tr><td colSpan={4} style={{ color: "#566271" }}>dados em breve — Fase 3</td></tr></tbody>
        </table>
      </article>
    </section>
  );
}

function AuditoriaView() {
  return (
    <section className="grid">
      <article className="card chart-main">
        <div className="section-title"><h2>Eventos por dia</h2><div className="legend"><span><i className="l1" />Anomalias detectadas</span></div></div>
        <div className="chart"><div className="gridlines" /></div>
      </article>
      <article className="card side-chart">
        <div className="section-title"><h2>Tipos de anomalia</h2><span>ranking</span></div>
        <RankCardContent items={[["AN1 · Documentos", "--"], ["AN2 · Pacientes", "--"], ["AN4 · Local", "--"], ["AN3 · Tempo emissões", "--"]]} />
      </article>
      <article className="card" style={{ gridColumn: "span 7" }}>
        <div className="section-title"><h2>Detalhe agregado — dia × dimensão × tipo</h2><span>observado vs. média esperada</span></div>
        <table className="table">
          <thead><tr><th>Dia</th><th>Anomalia</th><th>Dimensão</th><th>Observado</th><th>Média esperada</th><th>Desvio</th><th>Severidade</th></tr></thead>
          <tbody><tr><td colSpan={7} style={{ color: "#566271" }}>dados em breve — Fase 3</td></tr></tbody>
        </table>
      </article>
      <article className="card" style={{ gridColumn: "span 5" }}>
        <div className="section-title"><h2>Dimensões afetadas</h2><span>ranking</span></div>
        <RankCardContent items={[["Documentos", "--"], ["Atendimentos", "--"], ["Local", "--"], ["Dispensações", "--"]]} />
      </article>
      <article className="sql-box">
        <span className="kw">SELECT</span> <span className="fn">dt_referencia</span>, tipo_anomalia, dimensao_afetada, ...<br />
        <span className="kw">FROM</span> prescricao.fato_auditoria_dia <span className="kw">WHERE</span> ...
      </article>
    </section>
  );
}

function RankCardContent({ items }: { items: [string, string][] }) {
  return (
    <div>
      {items.map(([name, val]) => (
        <div className="barrow" key={name}>
          <span>{name}</span>
          <span className="bar-track"><i className="bar-fill" style={{ width: "20%" }} /></span>
          <b>{val}</b>
        </div>
      ))}
    </div>
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
          <div>
            <strong>Prescrição</strong>
            <span>Eletrônica CFM</span>
          </div>
        </div>
        <div className="top-right">
          <span className={`chip ${chipCls}`}>
            <i className={`dot ${job?.status === "failed" ? "bad" : ""}`} />
            Carga <b>{job ? job.status : "—"}</b>
          </span>
          <span className="chip">
            Dados <b>{dadosDia ? new Date(dadosDia).toLocaleDateString("pt-BR") : "—"}</b>
          </span>
          <button className="btn primary" onClick={refresh} disabled={btn !== "Atualizar dados"}>
            {btn}
          </button>
          <span className="chip">{mock ? "DEV" : email}</span>
        </div>
      </header>

      <nav className="tabs">
        {VIEWS.map((v) => (
          <button
            key={v}
            className={`tab ${view === v ? "active" : ""}`}
            data-view={v}
            onClick={() => setView(v)}
          >
            {v === "documentos" && "⌂"}
            {v === "medicos" && "◈"}
            {v === "dispensacoes" && "⌁"}
            {v === "auditoria" && "△"}
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
            <div className="filters">
              <div className="filter active">Período <b>· 30 dias</b></div>
              <div className="filter">UF <b>· Todas</b></div>
              <div className="filter">Tipo <b>· Todos</b></div>
              <div className="meta">última carga: {health?.job?.finalizado_em ? new Date(health.job.finalizado_em).toLocaleString("pt-BR") : "—"}</div>
            </div>
            {v === "documentos" && <DocumentsView />}
            {v === "medicos" && <MedicosView />}
            {v === "dispensacoes" && <DispensacoesView />}
            {v === "auditoria" && <AuditoriaView />}
          </section>
        ))}
        <div className="footer">
          <span>PE Dashboard · CFM</span>
          <span>Ambiente operacional · Fase 1 (shell)</span>
        </div>
      </main>
    </>
  );
}
