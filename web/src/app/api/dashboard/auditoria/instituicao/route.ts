import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";

export async function GET(req: NextRequest) {
  const url = req.nextUrl;
  const chave = url.searchParams.get("chave") ?? "";
  const ate = url.searchParams.get("ate") ?? new Date().toISOString().slice(0, 10);
  const de = url.searchParams.get("de") ?? new Date(Date.now() - 30 * 864e5).toISOString().slice(0, 10);

  let filtro: string;
  let params: (string | number)[];
  if (/^CNES:/.test(chave)) {
    filtro = "NULLIF(u.co_cnes, '') = $3";
    params = [de, ate, chave.slice("CNES:".length)];
  } else if (/^UNIDADE:\d+$/.test(chave)) {
    filtro = "f.id_unidade_atendimento = $3";
    params = [de, ate, Number(chave.slice("UNIDADE:".length))];
  } else {
    return NextResponse.json({ erro: "chave invalida" }, { status: 400 });
  }

  try {
    const [resumo, serie, unidades, porTipo] = await Promise.all([
      query(
        `SELECT count(DISTINCT f.id_paciente)::bigint AS pacientes,
                count(DISTINCT f.id_unidade_atendimento)::int AS unidades,
                MAX(f.sg_uf) AS uf,
                MAX(NULLIF(u.nm_unidade, '')) AS nome
           FROM prescricao.fato_documento_unidade_paciente_dia f
           LEFT JOIN prescricao.dim_unidade u ON u.id_unidade_atendimento = f.id_unidade_atendimento
          WHERE f.dia BETWEEN $1 AND $2 AND ${filtro}`,
        params
      ),
      query(
        `SELECT to_char(f.dia, 'YYYY-MM') AS mes, count(DISTINCT f.id_paciente)::bigint AS pacientes
           FROM prescricao.fato_documento_unidade_paciente_dia f
           LEFT JOIN prescricao.dim_unidade u ON u.id_unidade_atendimento = f.id_unidade_atendimento
          WHERE f.dia BETWEEN $1 AND $2 AND ${filtro}
          GROUP BY 1 ORDER BY 1`,
        params
      ),
      query(
        `SELECT f.id_unidade_atendimento,
                COALESCE(NULLIF(MAX(u.nm_unidade), ''), 'UNIDADE:' || f.id_unidade_atendimento::text) AS nome,
                NULLIF(MAX(u.co_cnes), '') AS cnes,
                MAX(f.sg_uf) AS uf,
                count(DISTINCT f.id_paciente)::bigint AS pacientes
           FROM prescricao.fato_documento_unidade_paciente_dia f
           LEFT JOIN prescricao.dim_unidade u ON u.id_unidade_atendimento = f.id_unidade_atendimento
          WHERE f.dia BETWEEN $1 AND $2 AND ${filtro}
          GROUP BY f.id_unidade_atendimento
          ORDER BY pacientes DESC
          LIMIT 50`,
        params
      ),
      query(
        `SELECT t.nm_documento AS tipo, count(*)::bigint AS documentos
           FROM prescricao.fato_documento_emissao f
           LEFT JOIN prescricao.dim_unidade u ON u.id_unidade_atendimento = f.id_unidade_atendimento
           JOIN prescricao.dim_tipo_documento t ON t.id_tipo_documento = f.id_tipo_documento
          WHERE f.dia BETWEEN $1 AND $2
            AND f.in_assinado = 'S'
            AND ${filtro}
          GROUP BY t.nm_documento
          ORDER BY documentos DESC`,
        params
      ),
    ]);

    const r = resumo.rows[0] ?? {};
    const nomeGrupo = r.nome ?? unidades.rows[0]?.nome ?? chave;
    return NextResponse.json({
      chave,
      instituicao: nomeGrupo,
      cnes: /^CNES:/.test(chave) ? chave.slice("CNES:".length) : (unidades.rows[0]?.cnes ?? null),
      uf: r.uf ?? null,
      total_pacientes: r.pacientes ?? "0",
      total_unidades: r.unidades ?? 0,
      serie_mensal: serie.rows,
      unidades: unidades.rows,
      por_tipo: porTipo.rows,
    });
  } catch (e) {
    return NextResponse.json({ erro: String(e) }, { status: 500 });
  }
}
