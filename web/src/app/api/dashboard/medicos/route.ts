import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";

export async function GET(req: NextRequest) {
  const url = req.nextUrl;
  const ate = url.searchParams.get("ate") ?? new Date().toISOString().slice(0, 10);
  const de = url.searchParams.get("de") ?? new Date(Date.now() - 30 * 864e5).toISOString().slice(0, 10);
  const uf = url.searchParams.get("uf") || null;

  try {
    const [snapshot, novos, porUf, inatividade] = await Promise.all([
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
          WHERE ($1::text IS NULL OR sg_uf = $1)
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
        `WITH ult AS (
           SELECT id_medico, max(dia) AS ultimo
             FROM prescricao.fato_documento_medico_dia
            WHERE ($1::text IS NULL OR sg_uf = $1)
            GROUP BY id_medico
         ), ref AS (SELECT max(dia) AS hoje FROM prescricao.fato_documento_medico_dia)
         SELECT CASE
                  WHEN (ref.hoje - u.ultimo) <= 30 THEN '0-30'
                  WHEN (ref.hoje - u.ultimo) <= 60 THEN '31-60'
                  WHEN (ref.hoje - u.ultimo) <= 90 THEN '61-90'
                  WHEN (ref.hoje - u.ultimo) <= 120 THEN '91-120'
                  ELSE '120+' END AS faixa,
                count(*) AS medicos
           FROM ult u CROSS JOIN ref
          GROUP BY 1 ORDER BY 1`,
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
    });
  } catch (e) {
    return NextResponse.json({ erro: String(e) }, { status: 500 });
  }
}
