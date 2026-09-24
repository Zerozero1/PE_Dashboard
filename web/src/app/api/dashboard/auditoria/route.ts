import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";

export async function GET(req: NextRequest) {
  const url = req.nextUrl;
  const ate = url.searchParams.get("ate") ?? new Date().toISOString().slice(0, 10);
  const de = url.searchParams.get("de") ?? new Date(Date.now() - 30 * 864e5).toISOString().slice(0, 10);
  const uf = url.searchParams.get("uf") || null;
  const tipo = url.searchParams.get("tipo") || null;
  const limiteRaw = Number(url.searchParams.get("limite") ?? 20);
  const limite = Number.isFinite(limiteRaw) ? Math.min(Math.max(Math.trunc(limiteRaw), 1), 500) : 20;

  try {
    const an1 = await query(
      `SELECT m.id_medico, m.nu_crm AS crm, m.sg_uf AS crm_uf, m.nm_medico AS nome,
              sum(f.documentos) AS docs
         FROM prescricao.fato_documento_medico_tipo_dia f
         JOIN prescricao.dim_medico m ON m.id_medico = f.id_medico
        WHERE f.dia BETWEEN $1 AND $2
          AND ($3::text IS NULL OR f.sg_uf = $3)
          AND ($4::int IS NULL OR f.id_tipo_documento = $4)
        GROUP BY m.id_medico, m.nu_crm, m.sg_uf, m.nm_medico
        ORDER BY docs DESC
        LIMIT $5`,
      [de, ate, uf, tipo, limite]
    );

    return NextResponse.json({ de, ate, an1: an1.rows });
  } catch (e) {
    return NextResponse.json({ erro: String(e) }, { status: 500 });
  }
}
