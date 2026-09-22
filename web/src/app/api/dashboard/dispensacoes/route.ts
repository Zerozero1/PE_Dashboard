import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";

export async function GET(req: NextRequest) {
  const url = req.nextUrl;
  const ate = url.searchParams.get("ate") ?? new Date().toISOString().slice(0, 10);
  const de = url.searchParams.get("de") ?? new Date(Date.now() - 30 * 864e5).toISOString().slice(0, 10);
  const uf = url.searchParams.get("uf") || null;

  try {
    const [kpis, serie, porUf] = await Promise.all([
      query(
        `SELECT coalesce(sum(dispensacoes),0) AS dispensacoes,
                coalesce(sum(assinadas),0) AS assinadas,
                coalesce(sum(canceladas),0) AS canceladas,
                coalesce(sum(pacientes_distintos),0) AS pacientes
           FROM prescricao.fato_dispensacao_dia
          WHERE dia BETWEEN $1 AND $2 AND ($3::text IS NULL OR sg_uf = $3)`,
        [de, ate, uf]
      ),
      query(
        `SELECT to_char(dia,'YYYY-MM') AS mes,
                sum(dispensacoes) AS dispensacoes,
                sum(assinadas) AS assinadas,
                sum(canceladas) AS canceladas
           FROM prescricao.fato_dispensacao_dia
          WHERE ($1::text IS NULL OR sg_uf = $1)
          GROUP BY 1 ORDER BY 1`,
        [uf]
      ),
      query(
        `SELECT sg_uf AS uf, sum(dispensacoes) AS dispensacoes,
                sum(assinadas) AS assinadas,
                round(100.0 * sum(assinadas) / nullif(sum(dispensacoes),0), 2) AS pct
           FROM prescricao.fato_dispensacao_dia
          WHERE dia BETWEEN $1 AND $2
          GROUP BY 1 ORDER BY 2 DESC`,
        [de, ate]
      ),
    ]);

    const k = kpis.rows[0];
    return NextResponse.json({
      de,
      ate,
      kpis: {
        dispensacoes: Number(k?.dispensacoes ?? 0),
        assinadas: Number(k?.assinadas ?? 0),
        canceladas: Number(k?.canceladas ?? 0),
        pacientes: Number(k?.pacientes ?? 0),
      },
      serie_mensal: serie.rows,
      por_uf: porUf.rows,
    });
  } catch (e) {
    return NextResponse.json({ erro: String(e) }, { status: 500 });
  }
}
