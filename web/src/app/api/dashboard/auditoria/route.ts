import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";

export async function GET(req: NextRequest) {
  const url = req.nextUrl;
  const ate = url.searchParams.get("ate") ?? new Date().toISOString().slice(0, 10);
  const de = url.searchParams.get("de") ?? new Date(Date.now() - 7 * 864e5).toISOString().slice(0, 10);
  const tipo = url.searchParams.get("tipo") || null;
  const dim = url.searchParams.get("dim") || null;

  const where = `WHERE dia BETWEEN $1 AND $2
    AND ($3::text IS NULL OR tipo_anomalia = $3)
    AND ($4::text IS NULL OR dimensao_afetada = $4)`;
  const p = [de, ate, tipo, dim];

  try {
    const [porDia, tipos, dims, detalhe] = await Promise.all([
      query(
        `SELECT dia, count(*) AS eventos
           FROM prescricao.fato_auditoria_dia ${where}
          GROUP BY 1 ORDER BY 1`,
        p
      ),
      query(
        `SELECT tipo_anomalia AS tipo, count(*) AS eventos
           FROM prescricao.fato_auditoria_dia ${where}
          GROUP BY 1 ORDER BY 2 DESC`,
        p
      ),
      query(
        `SELECT dimensao_afetada AS dimensao, count(*) AS eventos
           FROM prescricao.fato_auditoria_dia ${where}
          GROUP BY 1 ORDER BY 2 DESC`,
        p
      ),
      query(
        `SELECT dia, tipo_anomalia, dimensao_afetada,
                valor_observado, valor_esperado, desvio, severidade
           FROM prescricao.fato_auditoria_dia ${where}
          ORDER BY dia DESC, severidade DESC LIMIT 100`,
        p
      ),
    ]);

    return NextResponse.json({
      de,
      ate,
      por_dia: porDia.rows,
      tipos: tipos.rows,
      dimensoes: dims.rows,
      detalhe: detalhe.rows,
    });
  } catch (e) {
    return NextResponse.json({ erro: String(e) }, { status: 500 });
  }
}
