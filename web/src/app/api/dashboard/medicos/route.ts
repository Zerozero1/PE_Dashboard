import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";

export async function GET(req: NextRequest) {
  const url = req.nextUrl;
  const ate = url.searchParams.get("ate") ?? new Date().toISOString().slice(0, 10);
  const de = url.searchParams.get("de") ?? new Date(Date.now() - 30 * 864e5).toISOString().slice(0, 10);
  const uf = url.searchParams.get("uf") || null;

  try {
    const [snapshot, novos, porUf, inatividade, emissoresMensal, emissores30d] = await Promise.all([
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
        `SELECT sg_uf AS uf, inscricoes_cadastradas, medicos_ativos
           FROM prescricao.fato_medico_snapshot
          WHERE sg_uf <> '--'
          ORDER BY inscricoes_cadastradas DESC`
      ),
      query(
        `WITH ref AS (SELECT max(dia) AS hoje FROM prescricao.fato_documento_medico_dia)
         SELECT CASE
                  WHEN (ref.hoje - e.ultimo_dia) <= 30 THEN '0-30'
                  WHEN (ref.hoje - e.ultimo_dia) <= 60 THEN '31-60'
                  WHEN (ref.hoje - e.ultimo_dia) <= 90 THEN '61-90'
                  WHEN (ref.hoje - e.ultimo_dia) <= 120 THEN '91-120'
                  ELSE '120+' END AS faixa,
                count(*) AS medicos
           FROM prescricao.fato_medico_extremos_emissao e CROSS JOIN ref
          WHERE e.sg_uf = COALESCE($1::text, '--')
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
    });
  } catch (e) {
    return NextResponse.json({ erro: String(e) }, { status: 500 });
  }
}
