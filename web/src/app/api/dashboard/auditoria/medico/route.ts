import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";

export async function GET(req: NextRequest) {
  const url = req.nextUrl;
  const idMedicoRaw = Number(url.searchParams.get("id_medico"));
  const idMedico = Number.isInteger(idMedicoRaw) ? idMedicoRaw : null;
  const ate = url.searchParams.get("ate") ?? new Date().toISOString().slice(0, 10);
  const de = url.searchParams.get("de") ?? new Date(Date.now() - 30 * 864e5).toISOString().slice(0, 10);
  const uf = url.searchParams.get("uf") || null;

  if (idMedico === null) {
    return NextResponse.json({ erro: "id_medico invalido" }, { status: 400 });
  }

  try {
    const [medico, porTipo, serieMensal, especialidades] = await Promise.all([
      query(
        `SELECT m.nm_medico AS nome, m.nu_crm AS crm, m.sg_uf AS crm_uf,
                m.in_situacao AS situacao, m.in_tipo_inscricao AS tipo_inscricao
           FROM prescricao.dim_medico m
          WHERE m.id_medico = $1`,
        [idMedico]
      ),
      query(
        `SELECT t.nm_documento AS tipo, sum(f.documentos) AS docs
           FROM prescricao.fato_documento_medico_tipo_dia f
           JOIN prescricao.dim_tipo_documento t ON t.id_tipo_documento = f.id_tipo_documento
          WHERE f.id_medico = $1
            AND f.dia BETWEEN $2 AND $3
            AND ($4::text IS NULL OR f.sg_uf = $4)
          GROUP BY 1 ORDER BY 2 DESC`,
        [idMedico, de, ate, uf]
      ),
      query(
        `SELECT to_char(f.dia,'YYYY-MM') AS mes, sum(f.documentos) AS docs
           FROM prescricao.fato_documento_medico_tipo_dia f
          WHERE f.id_medico = $1
            AND f.dia BETWEEN $2 AND $3
            AND ($4::text IS NULL OR f.sg_uf = $4)
          GROUP BY 1 ORDER BY 1`,
        [idMedico, de, ate, uf]
      ),
      query(
        `SELECT e.ds_especialidade AS esp
           FROM prescricao.dim_especialidade e
          WHERE e.id_medico = $1 AND e.ds_especialidade IS NOT NULL
          ORDER BY 1`,
        [idMedico]
      ),
    ]);

    return NextResponse.json({
      medico: medico.rows[0] ?? null,
      por_tipo: porTipo.rows,
      serie_mensal: serieMensal.rows,
      especialidades: especialidades.rows.map((r) => r.esp),
    });
  } catch (e) {
    return NextResponse.json({ erro: String(e) }, { status: 500 });
  }
}
