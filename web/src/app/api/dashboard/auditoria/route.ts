import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";

export async function GET(req: NextRequest) {
  const url = req.nextUrl;
  const anomalia = url.searchParams.get("anomalia") ?? "AN1";
  const ate = url.searchParams.get("ate") ?? new Date().toISOString().slice(0, 10);
  const de = url.searchParams.get("de") ?? new Date(Date.now() - 30 * 864e5).toISOString().slice(0, 10);
  const uf = url.searchParams.get("uf") || null;
  const tipo = url.searchParams.get("tipo") || null;
  const limiteRaw = Number(url.searchParams.get("limite") ?? 20);
  const limite = Number.isFinite(limiteRaw) ? Math.min(Math.max(Math.trunc(limiteRaw), 1), 500) : 20;

  try {
    if (anomalia === "AN1") {
      const rows = await query(
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
      return NextResponse.json({ de, ate, an1: rows.rows });
    }

    if (anomalia === "AN2") {
      const rows = await query(
        `SELECT m.id_medico, m.nu_crm AS crm, m.sg_uf AS crm_uf, m.nm_medico AS nome,
                count(DISTINCT f.id_paciente)::bigint AS pacientes
           FROM prescricao.fato_documento_medico_paciente_dia f
           JOIN prescricao.dim_medico m ON m.id_medico = f.id_medico
          WHERE f.dia BETWEEN $1 AND $2
            AND ($3::text IS NULL OR f.sg_uf = $3)
          GROUP BY m.id_medico, m.nu_crm, m.sg_uf, m.nm_medico
          ORDER BY pacientes DESC
          LIMIT $4`,
        [de, ate, uf, limite]
      );
      return NextResponse.json({ de, ate, an2: rows.rows });
    }

    if (anomalia === "AN3") {
      const rows = await query(
        `WITH pessoa_unidade AS (
           SELECT f.id_pessoa,
                  COALESCE('CNES:' || NULLIF(u.co_cnes, ''), 'UNIDADE:' || f.id_unidade_atendimento::text) AS instituicao_key,
                   NULLIF(u.co_cnes, '') AS cnes,
                   MAX(NULLIF(u.nm_unidade, '')) AS instituicao,
                   MAX(f.sg_uf) AS uf,
                   sum(f.documentos)::bigint AS documentos,
                   max(CASE WHEN $4::int IS NULL THEN f.max_docs_300s_multi_paciente ELSE f.max_docs_300s_tipo_multi_paciente END)::bigint AS pico_5min
             FROM prescricao.fato_an3_medico_unidade_tipo_dia f
             LEFT JOIN prescricao.dim_unidade u ON u.id_unidade_atendimento = f.id_unidade_atendimento
            WHERE f.dia BETWEEN $1 AND $2
              AND ($3::text IS NULL OR f.sg_uf = $3)
              AND ($4::int IS NULL OR f.id_tipo_documento = $4)
            GROUP BY f.id_pessoa,
                     COALESCE('CNES:' || NULLIF(u.co_cnes, ''), 'UNIDADE:' || f.id_unidade_atendimento::text),
                     NULLIF(u.co_cnes, '')
         ), por_pessoa AS (
            SELECT id_pessoa,
                   sum(documentos)::bigint AS documentos,
                   max(pico_5min)::bigint AS pico_5min,
                   count(*)::int AS unidades
             FROM pessoa_unidade
            GROUP BY id_pessoa
         ), candidatos AS (
            SELECT *
              FROM por_pessoa
             WHERE pico_5min >= 2
         ), unidade_pico AS (
         SELECT DISTINCT ON (id_pessoa)
                  id_pessoa, instituicao_key, cnes, instituicao, uf
             FROM pessoa_unidade
             ORDER BY id_pessoa, pico_5min DESC, documentos DESC
         ), inscricoes AS (
           SELECT id_pessoa,
                  max(nm_medico) AS nome,
                  string_agg(
                    DISTINCT (nu_crm || '/' || btrim(sg_uf)),
                    ', ' ORDER BY (nu_crm || '/' || btrim(sg_uf))
                  ) AS inscricoes
             FROM prescricao.dim_medico
            WHERE id_pessoa IS NOT NULL
            GROUP BY id_pessoa
         )
         SELECT c.id_pessoa, i.nome, i.inscricoes,
                COALESCE(u.instituicao, u.instituicao_key) AS instituicao,
                u.instituicao_key, u.cnes, u.uf,
                 c.documentos, c.pico_5min, c.unidades
           FROM candidatos c
           LEFT JOIN inscricoes i ON i.id_pessoa = c.id_pessoa
           LEFT JOIN unidade_pico u ON u.id_pessoa = c.id_pessoa
           ORDER BY c.pico_5min DESC, c.documentos DESC
          LIMIT $5`,
        [de, ate, uf, tipo, limite]
      );
      return NextResponse.json({ de, ate, an3: rows.rows });
    }

    return NextResponse.json({ de, ate, info: "em breve" });
  } catch (e) {
    return NextResponse.json({ erro: String(e) }, { status: 500 });
  }
}
