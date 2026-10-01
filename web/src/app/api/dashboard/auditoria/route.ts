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
    const deRaw = url.searchParams.get("de");
    const ateRaw = url.searchParams.get("ate");
    const todos = !deRaw || !ateRaw;

    if (anomalia === "AN1") {
      if (todos) {
        const rows = await query(
          `SELECT m.id_medico, m.nu_crm AS crm, m.sg_uf AS crm_uf, m.nm_medico AS nome,
                  sum(s.documentos)::bigint AS docs
             FROM prescricao.snap_medico_tipo s
             JOIN prescricao.dim_medico m ON m.id_medico = s.id_medico
            WHERE ($1::text IS NULL OR s.sg_uf = $1)
              AND ($2::int IS NULL OR s.id_tipo_documento = $2)
            GROUP BY m.id_medico, m.nu_crm, m.sg_uf, m.nm_medico
            ORDER BY docs DESC
            LIMIT $3`,
          [uf, tipo, limite]
        );
        return NextResponse.json({ de: null, ate: null, an1: rows.rows });
      }
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
      if (todos) {
        const rows = await query(
          `SELECT m.id_medico, m.nu_crm AS crm, m.sg_uf AS crm_uf, m.nm_medico AS nome,
                  s.pacientes
             FROM prescricao.snap_medico_paciente s
             JOIN prescricao.dim_medico m ON m.id_medico = s.id_medico
            WHERE s.sg_uf = CASE WHEN $1::text IS NULL THEN '**' ELSE $1 END
            ORDER BY s.pacientes DESC
            LIMIT $2`,
          [uf, limite]
        );
        return NextResponse.json({ de: null, ate: null, an2: rows.rows });
      }
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
      const deRaw = url.searchParams.get("de");
      const ateRaw = url.searchParams.get("ate");
      if (deRaw && ateRaw) {
        const rows = await query(
          `WITH por_dia AS (
             SELECT id_medico, dia, count(*)::bigint AS documentos
               FROM prescricao.fato_documento_emissao
              WHERE dia BETWEEN $1 AND $2
                AND in_assinado = 'S'
                AND ($3::text IS NULL OR sg_uf = $3)
              GROUP BY id_medico, dia
           ), melhor AS (
             SELECT DISTINCT ON (id_medico) id_medico, dia, documentos
               FROM por_dia ORDER BY id_medico, documentos DESC, dia
           )
           SELECT b.id_medico, m.nu_crm AS crm, m.sg_uf AS crm_uf, m.nm_medico AS nome,
                  to_char(b.dia, 'YYYY-MM-DD') AS dia, b.documentos,
                  COALESCE((SELECT count(DISTINCT p.id_paciente)
                              FROM prescricao.fato_documento_medico_paciente_dia p
                             WHERE p.id_medico = b.id_medico AND p.dia = b.dia
                               AND ($3::text IS NULL OR p.sg_uf = $3)), 0)::bigint AS pacientes
             FROM melhor b
             JOIN prescricao.dim_medico m ON m.id_medico = b.id_medico
            ORDER BY b.documentos DESC, pacientes DESC
            LIMIT $4`,
          [deRaw, ateRaw, uf, limite]
        );
        return NextResponse.json({ de: deRaw, ate: ateRaw, an3: rows.rows });
      }
      const rows = await query(
        `WITH por_medico AS (
           SELECT DISTINCT ON (id_medico) id_medico, sg_uf, dia, documentos, pacientes
             FROM prescricao.fato_medico_maior_dia
            WHERE ($1::text IS NULL OR sg_uf = $1)
            ORDER BY id_medico, documentos DESC, dia
         )
         SELECT p.id_medico, m.nu_crm AS crm, m.sg_uf AS crm_uf, m.nm_medico AS nome,
                to_char(p.dia, 'YYYY-MM-DD') AS dia, p.documentos, p.pacientes
           FROM por_medico p
           JOIN prescricao.dim_medico m ON m.id_medico = p.id_medico
          ORDER BY p.documentos DESC, p.pacientes DESC
          LIMIT $2`,
        [uf, limite]
      );
      return NextResponse.json({ de: null, ate: null, an3: rows.rows });
    }

    if (anomalia === "AN4") {
      if (todos) {
        const rows = await query(
          `SELECT s.chave, COALESCE(s.instituicao, s.chave) AS instituicao, s.cnes, s.uf,
                  s.unidades, s.medicos, s.pacientes
             FROM prescricao.snap_instituicao s
            WHERE ($1::text IS NULL OR s.uf = $1)
            ORDER BY s.pacientes DESC
            LIMIT $2`,
          [uf, limite]
        );
        return NextResponse.json({ de: null, ate: null, an4: rows.rows });
      }
      const rows = await query(
        `WITH por_instituicao AS (
           SELECT COALESCE(NULLIF(u.co_cnes, ''), 'UNIDADE:' || f.id_unidade_atendimento::text) AS chave,
                  NULLIF(u.co_cnes, '') AS cnes,
                  MAX(NULLIF(u.nm_unidade, '')) AS instituicao,
                  MAX(f.sg_uf) AS uf,
                  count(DISTINCT f.id_unidade_atendimento)::int AS unidades,
                  count(DISTINCT f.id_paciente)::bigint AS pacientes
             FROM prescricao.fato_documento_unidade_paciente_dia f
             LEFT JOIN prescricao.dim_unidade u ON u.id_unidade_atendimento = f.id_unidade_atendimento
            WHERE f.dia BETWEEN $1 AND $2
              AND ($3::text IS NULL OR f.sg_uf = $3)
            GROUP BY 1, 2
         ), medicos_instituicao AS (
           SELECT COALESCE(NULLIF(u.co_cnes, ''), 'UNIDADE:' || mu.id_unidade_atendimento::text) AS chave,
                  count(DISTINCT mu.id_medico)::int AS medicos
             FROM prescricao.fato_medico_unidade mu
             LEFT JOIN prescricao.dim_unidade u ON u.id_unidade_atendimento = mu.id_unidade_atendimento
            WHERE mu.in_ativo = 'S'
            GROUP BY 1
         )
         SELECT i.chave, COALESCE(i.instituicao, i.chave) AS instituicao, i.cnes, i.uf,
                i.unidades, COALESCE(m.medicos, 0)::int AS medicos, i.pacientes
           FROM por_instituicao i
           LEFT JOIN medicos_instituicao m ON m.chave = i.chave
          ORDER BY i.pacientes DESC
          LIMIT $4`,
        [de, ate, uf, limite]
      );
      return NextResponse.json({ de, ate, an4: rows.rows });
    }

    return NextResponse.json({ de, ate, info: "em breve" });
  } catch (e) {
    return NextResponse.json({ erro: String(e) }, { status: 500 });
  }
}
