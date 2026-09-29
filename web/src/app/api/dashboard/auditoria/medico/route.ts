import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";

export async function GET(req: NextRequest) {
  const url = req.nextUrl;
  const idMedicoRaw = Number(url.searchParams.get("id_medico"));
  const idMedico = Number.isInteger(idMedicoRaw) ? idMedicoRaw : null;
  const idPessoaRaw = Number(url.searchParams.get("id_pessoa"));
  const idPessoa = Number.isInteger(idPessoaRaw) ? idPessoaRaw : null;
  const anomalia = url.searchParams.get("anomalia") ?? "AN1";
  const ate = url.searchParams.get("ate") ?? new Date().toISOString().slice(0, 10);
  const de = url.searchParams.get("de") ?? new Date(Date.now() - 30 * 864e5).toISOString().slice(0, 10);
  const uf = url.searchParams.get("uf") || null;
  const tipo = url.searchParams.get("tipo") || null;

  try {
    if (anomalia === "AN3") {
      if (idPessoa === null || idPessoa <= 0) {
        return NextResponse.json({ erro: "id_pessoa invalido" }, { status: 400 });
      }

      const [medico, serie] = await Promise.all([
        query(
          `SELECT max(nm_medico) AS nome,
                  string_agg(
                    DISTINCT (nu_crm || '/' || btrim(sg_uf)),
                    ', ' ORDER BY (nu_crm || '/' || btrim(sg_uf))
                  ) AS inscricoes
             FROM prescricao.dim_medico
            WHERE id_pessoa = $1`,
          [idPessoa]
        ),
        query(
          `SELECT f.dia,
                  COALESCE('CNES:' || NULLIF(u.co_cnes, ''), 'UNIDADE:' || f.id_unidade_atendimento::text) AS instituicao_key,
                  COALESCE(MAX(NULLIF(u.nm_unidade, '')), COALESCE('CNES:' || NULLIF(u.co_cnes, ''), 'UNIDADE:' || f.id_unidade_atendimento::text)) AS instituicao,
                  NULLIF(u.co_cnes, '') AS cnes,
                  MAX(f.sg_uf) AS uf,
                  sum(f.documentos)::bigint AS documentos,
                  sum(CASE WHEN $5::int IS NULL THEN f.intervalos ELSE f.intervalos_tipo END)::bigint AS intervalos,
                  sum(CASE WHEN $5::int IS NULL THEN f.intervalos_ate_5s ELSE f.intervalos_tipo_ate_5s END)::bigint AS intervalos_ate_5s,
                  max(CASE WHEN $5::int IS NULL THEN f.max_docs_60s ELSE f.max_docs_60s_tipo END)::bigint AS pico_60s
             FROM prescricao.fato_an3_medico_unidade_tipo_dia f
             LEFT JOIN prescricao.dim_unidade u ON u.id_unidade_atendimento = f.id_unidade_atendimento
            WHERE f.id_pessoa = $1
              AND f.dia BETWEEN $2 AND $3
              AND ($4::text IS NULL OR f.sg_uf = $4)
              AND ($5::int IS NULL OR f.id_tipo_documento = $5)
            GROUP BY f.dia,
                     COALESCE('CNES:' || NULLIF(u.co_cnes, ''), 'UNIDADE:' || f.id_unidade_atendimento::text),
                     NULLIF(u.co_cnes, '')
            ORDER BY f.dia, pico_60s DESC, documentos DESC`,
          [idPessoa, de, ate, uf, tipo]
        ),
      ]);

      const resumo = serie.rows.reduce((acc, row) => {
        acc.documentos += Number(row.documentos);
        acc.intervalos += Number(row.intervalos);
        acc.intervalos_ate_5s += Number(row.intervalos_ate_5s);
        acc.pico_60s = Math.max(acc.pico_60s, Number(row.pico_60s));
        acc.instituicoes.add(row.instituicao_key);
        return acc;
      }, {
        documentos: 0,
        intervalos: 0,
        intervalos_ate_5s: 0,
        pico_60s: 0,
        instituicoes: new Set<string>(),
      });

      return NextResponse.json({
        id_pessoa: idPessoa,
        medico: medico.rows[0] ?? { nome: null, inscricoes: null },
        resumo: {
          documentos: resumo.documentos,
          intervalos_ate_5s: resumo.intervalos_ate_5s,
          pico_60s: resumo.pico_60s,
          pct_intervalos_ate_5s: resumo.intervalos > 0
            ? Math.round((resumo.intervalos_ate_5s / resumo.intervalos) * 1000) / 10
            : null,
          instituicoes: resumo.instituicoes.size,
        },
        diario: serie.rows,
      });
    }

    if (idMedico === null || idMedico <= 0) {
      return NextResponse.json({ erro: "id_medico invalido" }, { status: 400 });
    }

    const medicoQ = query(
      `SELECT m.nm_medico AS nome, m.nu_crm AS crm, m.sg_uf AS crm_uf,
              m.in_situacao AS situacao, m.in_tipo_inscricao AS tipo_inscricao
         FROM prescricao.dim_medico m
        WHERE m.id_medico = $1`,
      [idMedico]
    );

    const especialidadesQ = query(
      `SELECT e.ds_especialidade AS esp
         FROM prescricao.dim_especialidade e
        WHERE e.id_medico = $1 AND e.ds_especialidade IS NOT NULL
        ORDER BY 1`,
      [idMedico]
    );

    let porTipoQ: ReturnType<typeof query>;
    let serieMensalQ: ReturnType<typeof query>;
    let totalPacientesQ: ReturnType<typeof query>;

    if (anomalia === "AN2") {
      porTipoQ = query("SELECT NULL::text AS tipo, NULL::bigint AS docs LIMIT 0");
      serieMensalQ = query(
        `SELECT to_char(f.dia,'YYYY-MM') AS mes, count(DISTINCT f.id_paciente)::bigint AS docs
           FROM prescricao.fato_documento_medico_paciente_dia f
          WHERE f.id_medico = $1
            AND f.dia BETWEEN $2 AND $3
            AND ($4::text IS NULL OR f.sg_uf = $4)
          GROUP BY 1 ORDER BY 1`,
        [idMedico, de, ate, uf]
      );
      totalPacientesQ = query(
        `SELECT count(DISTINCT f.id_paciente)::bigint AS total
           FROM prescricao.fato_documento_medico_paciente_dia f
          WHERE f.id_medico = $1
            AND f.dia BETWEEN $2 AND $3
            AND ($4::text IS NULL OR f.sg_uf = $4)`,
        [idMedico, de, ate, uf]
      );
    } else {
      porTipoQ = query(
        `SELECT t.nm_documento AS tipo, sum(f.documentos) AS docs
           FROM prescricao.fato_documento_medico_tipo_dia f
           JOIN prescricao.dim_tipo_documento t ON t.id_tipo_documento = f.id_tipo_documento
          WHERE f.id_medico = $1
            AND f.dia BETWEEN $2 AND $3
            AND ($4::text IS NULL OR f.sg_uf = $4)
          GROUP BY 1 ORDER BY 2 DESC`,
        [idMedico, de, ate, uf]
      );
      serieMensalQ = query(
        `SELECT to_char(f.dia,'YYYY-MM') AS mes, sum(f.documentos) AS docs
           FROM prescricao.fato_documento_medico_tipo_dia f
          WHERE f.id_medico = $1
            AND f.dia BETWEEN $2 AND $3
            AND ($4::text IS NULL OR f.sg_uf = $4)
          GROUP BY 1 ORDER BY 1`,
        [idMedico, de, ate, uf]
      );
      totalPacientesQ = query("SELECT NULL::bigint AS total LIMIT 0");
    }

    const [medico, porTipo, serieMensal, especialidades, totalPacientes] = await Promise.all([
      medicoQ, porTipoQ, serieMensalQ, especialidadesQ, totalPacientesQ,
    ]);

    return NextResponse.json({
      medico: medico.rows[0] ?? null,
      por_tipo: porTipo.rows,
      serie_mensal: serieMensal.rows,
      especialidades: especialidades.rows.map((r) => r.esp),
      total_pacientes: anomalia === "AN2" ? (totalPacientes.rows[0]?.total ?? 0) : null,
    });
  } catch (e) {
    return NextResponse.json({ erro: String(e) }, { status: 500 });
  }
}
