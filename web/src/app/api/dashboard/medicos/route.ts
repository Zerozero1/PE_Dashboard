import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";

const TODOS_DE = "2021-10-01";

export async function GET(req: NextRequest) {
  const url = req.nextUrl;
  const ate = url.searchParams.get("ate") ?? new Date().toISOString().slice(0, 10);
  const de = url.searchParams.get("de") ?? new Date(Date.now() - 30 * 864e5).toISOString().slice(0, 10);
  const uf = url.searchParams.get("uf") || null;
  const todos = de <= TODOS_DE;
  const espSql = todos
    ? `SELECT ds_especialidade AS especialidade, medicos, documentos
         FROM prescricao.snap_especialidade_medicos
        WHERE sg_uf = CASE WHEN $1::text IS NULL THEN '**' ELSE $1 END
        ORDER BY medicos DESC LIMIT 15`
    : `SELECT COALESCE(NULLIF(btrim(e.ds_especialidade), ''), 'NAO_INFORMADO') AS especialidade,
              count(DISTINCT dm.id_pessoa)::bigint AS medicos,
              sum(f.documentos)::bigint AS documentos
         FROM prescricao.fato_documento_especialidade_dia f
         JOIN prescricao.dim_especialidade e
           ON e.id_medico_especialidade = f.id_medico_especialidade
         JOIN prescricao.dim_medico dm ON dm.id_medico = e.id_medico
        WHERE f.dia BETWEEN $1 AND $2 AND ($3::text IS NULL OR f.sg_uf = $3)
        GROUP BY 1 ORDER BY medicos DESC LIMIT 15`;
  const espParams = todos ? [uf] : [de, ate, uf];

  try {
    const [snapshot, novos, porUf, inatividade, emissoresMensal, emissores30d, especialidades] = await Promise.all([
      query(
        `SELECT inscricoes_cadastradas AS inscricoes,
                medicos_ativos AS ativos
           FROM prescricao.fato_medico_snapshot
          WHERE sg_uf = COALESCE($1::text, '--')`,
        [uf]
      ),
      query(
        `SELECT to_char(dia,'YYYY-MM') AS mes, sum(novos_aceite_termo) AS novos
           FROM prescricao.fato_medico_dia
          WHERE sg_uf = COALESCE($1::text, '--')
          GROUP BY 1 ORDER BY 1`,
        [uf]
      ),
      query(
        `SELECT s.sg_uf AS uf, s.inscricoes_cadastradas, s.medicos_ativos, u.nu_populacao
           FROM prescricao.fato_medico_snapshot s
           LEFT JOIN prescricao.dim_uf u ON u.sg_uf = s.sg_uf
          WHERE s.sg_uf <> '--'
          ORDER BY s.inscricoes_cadastradas DESC`
      ),
      query(
        `WITH ref AS (SELECT max(dia) AS hoje FROM prescricao.fato_documento_medico_dia)
         SELECT CASE
                   WHEN (ref.hoje - e.ultimo_dia) <= 60 THEN '31-60'
                   WHEN (ref.hoje - e.ultimo_dia) <= 90 THEN '61-90'
                   WHEN (ref.hoje - e.ultimo_dia) <= 120 THEN '91-120'
                   ELSE '120+' END AS faixa,
                 count(*) AS medicos
            FROM prescricao.fato_medico_extremos_emissao e CROSS JOIN ref
           WHERE e.sg_uf = COALESCE($1::text, '--')
             AND (ref.hoje - e.ultimo_dia) > 30
           GROUP BY 1 ORDER BY 1`,
        [uf]
      ),
      query(
        `SELECT mes, cpfs_distintos AS emissao
           FROM prescricao.fato_medico_emissao_mes
          WHERE sg_uf = COALESCE($1::text, '--')
            AND mes BETWEEN to_char($2::date, 'YYYY-MM') AND to_char($3::date, 'YYYY-MM')
          ORDER BY 1`,
        [uf, de, ate]
      ),
      query(
        `SELECT count(*) AS n
           FROM prescricao.fato_medico_extremos_emissao
          WHERE sg_uf = COALESCE($1::text, '--')
            AND ultimo_dia >= (SELECT max(dia) - interval '30 days'
                                 FROM prescricao.fato_documento_medico_dia)`,
        [uf]
      ),
      query(espSql, espParams),
    ]);

    const s = snapshot.rows[0];
    return NextResponse.json({
      de,
      ate,
      kpis: {
        inscricoes: Number(s?.inscricoes ?? 0),
        ativos: Number(s?.ativos ?? 0),
      },
      novos_mensal: novos.rows,
      por_uf: porUf.rows,
      inatividade: inatividade.rows,
      emissores_mensal: emissoresMensal.rows,
      emissores_30d: Number(emissores30d.rows[0]?.n ?? 0),
      ranking_especialidades: especialidades.rows,
    });
  } catch (e) {
    return NextResponse.json({ erro: String(e) }, { status: 500 });
  }
}
