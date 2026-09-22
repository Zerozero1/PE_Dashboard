import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";

function filtro(url: URL) {
  const ate = url.searchParams.get("ate") ?? new Date().toISOString().slice(0, 10);
  const de = url.searchParams.get("de") ?? new Date(Date.now() - 30 * 864e5).toISOString().slice(0, 10);
  const uf = url.searchParams.get("uf") || null;
  const tipo = url.searchParams.get("tipo") || null;
  const assinado = url.searchParams.get("assinado") || null;
  return { de, ate, uf, tipo, assinado };
}

const WHERE_DOC = `
  WHERE f.dia BETWEEN $1 AND $2
    AND ($3::text IS NULL OR f.sg_uf = $3)
    AND ($4::int IS NULL OR f.id_tipo_documento = $4)
    AND ($5::text IS NULL OR f.in_assinado = $5)
`;

export async function GET(req: NextRequest) {
  const { de, ate, uf, tipo, assinado } = filtro(req.nextUrl);
  const p = [de, ate, uf, tipo, assinado];

  try {
    const [kpis, serie, porTipo, porUf, esp, pacientes, tabela] = await Promise.all([
      query(
        `SELECT coalesce(sum(f.documentos),0) AS emitidos,
                coalesce(sum(f.documentos) FILTER (WHERE f.in_assinado='S'),0) AS assinados,
                coalesce(sum(f.documentos) FILTER (WHERE f.in_assinado='N'),0) AS nao_assinados,
                coalesce(sum(f.cancelados),0) AS cancelados
           FROM prescricao.fato_documento_dia f ${WHERE_DOC}`,
        p
      ),
      query(
        `SELECT to_char(f.dia,'YYYY-MM') AS mes,
                sum(f.documentos) AS emitidos,
                sum(f.documentos) FILTER (WHERE f.in_assinado='S') AS assinados
           FROM prescricao.fato_documento_dia f ${WHERE_DOC}
          GROUP BY 1 ORDER BY 1`,
        p
      ),
      query(
        `SELECT t.nm_documento AS tipo, sum(f.documentos) AS docs
           FROM prescricao.fato_documento_dia f
           JOIN prescricao.dim_tipo_documento t ON t.id_tipo_documento = f.id_tipo_documento
           ${WHERE_DOC.replaceAll("f.id_tipo_documento = $4", "1=1")}
          GROUP BY 1 ORDER BY 2 DESC`,
        p
      ),
      query(
        `SELECT f.sg_uf AS uf, sum(f.documentos) AS docs
           FROM prescricao.fato_documento_dia f ${WHERE_DOC}
          GROUP BY 1 ORDER BY 2 DESC`,
        p
      ),
      query(
        `SELECT e.ds_especialidade AS especialidade, sum(f.documentos) AS docs
           FROM prescricao.fato_documento_especialidade_dia f
           JOIN prescricao.dim_especialidade e
             ON e.id_medico_especialidade = f.id_medico_especialidade
          WHERE f.dia BETWEEN $1 AND $2 AND ($3::text IS NULL OR f.sg_uf = $3)
          GROUP BY 1 ORDER BY 2 DESC LIMIT 10`,
        [de, ate, uf]
      ),
      query(
        `SELECT coalesce(sum(pacientes_distintos),0) AS pacientes
           FROM prescricao.fato_documento_paciente_dia
          WHERE dia BETWEEN $1 AND $2 AND ($3::text IS NULL OR sg_uf = $3)`,
        [de, ate, uf]
      ),
      query(
        `SELECT f.sg_uf AS uf, t.nm_documento AS tipo,
                sum(f.documentos) AS emitidos,
                sum(f.documentos) FILTER (WHERE f.in_assinado='S') AS assinados,
                round(100.0 * sum(f.documentos) FILTER (WHERE f.in_assinado='S')
                      / nullif(sum(f.documentos),0), 1) AS pct,
                sum(f.cancelados) AS cancelados
           FROM prescricao.fato_documento_dia f
           JOIN prescricao.dim_tipo_documento t ON t.id_tipo_documento = f.id_tipo_documento
          WHERE f.dia BETWEEN $1 AND $2 AND ($3::text IS NULL OR f.sg_uf = $3)
          GROUP BY 1,2 ORDER BY 1, sum(f.documentos) DESC LIMIT 100`,
        [de, ate, uf]
      ),
    ]);

    const k = kpis.rows[0];
    return NextResponse.json({
      de,
      ate,
      kpis: {
        emitidos: Number(k.emitidos),
        assinados: Number(k.assinados),
        nao_assinados: Number(k.nao_assinados),
        pct_assinatura: k.emitidos > 0 ? Math.round((Number(k.assinados) / Number(k.emitidos)) * 1000) / 10 : 0,
        cancelados: Number(k.cancelados),
        pacientes: Number(pacientes.rows[0]?.pacientes ?? 0),
      },
      serie_mensal: serie.rows,
      por_tipo: porTipo.rows,
      por_uf: porUf.rows,
      ranking_especialidade: esp.rows,
      tabela_uf_tipo: tabela.rows,
    });
  } catch (e) {
    return NextResponse.json({ erro: String(e) }, { status: 500 });
  }
}
