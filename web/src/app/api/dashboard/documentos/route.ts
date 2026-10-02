import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";

function filtro(url: URL) {
  const ate = url.searchParams.get("ate") ?? new Date().toISOString().slice(0, 10);
  const de = url.searchParams.get("de") ?? new Date(Date.now() - 30 * 864e5).toISOString().slice(0, 10);
  const uf = url.searchParams.get("uf") || null;
  const tipo = url.searchParams.get("tipo") || null;
  return { de, ate, uf, tipo };
}

const WHERE_DOC = `
  WHERE f.dia BETWEEN $1 AND $2
    AND ($3::text IS NULL OR f.sg_uf = $3)
    AND ($4::int IS NULL OR f.id_tipo_documento = $4)
`;

const TODOS_DE = "2021-10-01";

export async function GET(req: NextRequest) {
  const { de, ate, uf, tipo } = filtro(req.nextUrl);
  const p = [de, ate, uf, tipo];
  const todos = de <= TODOS_DE;
  const agrupar = req.nextUrl.searchParams.get("agrupar") === "principio";
  const espSql = todos
    ? `SELECT e.ds_especialidade AS especialidade, sum(s.documentos) AS docs
         FROM prescricao.snap_especialidade s
         JOIN prescricao.dim_especialidade e
           ON e.id_medico_especialidade = s.id_medico_especialidade
        WHERE ($1::text IS NULL OR s.sg_uf = $1)
        GROUP BY 1 ORDER BY 2 DESC LIMIT 10`
    : `SELECT e.ds_especialidade AS especialidade, sum(f.documentos) AS docs
         FROM prescricao.fato_documento_especialidade_dia f
         JOIN prescricao.dim_especialidade e
           ON e.id_medico_especialidade = f.id_medico_especialidade
        WHERE f.dia BETWEEN $1 AND $2 AND ($3::text IS NULL OR f.sg_uf = $3)
        GROUP BY 1 ORDER BY 2 DESC LIMIT 10`;
  const espParams = todos ? [uf] : [de, ate, uf];

  let medSql: string;
  let medParams: (string | null)[];
  if (todos) {
    medSql = agrupar
      ? `SELECT COALESCE(d.principio_ativo, t.medicamento) AS medicamento, sum(t.itens)::bigint AS itens
           FROM prescricao.snap_medicamento_top t
           LEFT JOIN prescricao.de_para_medicamento d ON d.medicamento = t.medicamento
          WHERE t.sg_uf = COALESCE($1::text, '**')
            AND t.id_tipo_documento = COALESCE($2::int, 0)
          GROUP BY 1 ORDER BY itens DESC LIMIT 15`
      : `SELECT t.medicamento, t.itens
           FROM prescricao.snap_medicamento_top t
          WHERE t.sg_uf = COALESCE($1::text, '**')
            AND t.id_tipo_documento = COALESCE($2::int, 0)
          ORDER BY t.posicao LIMIT 15`;
    medParams = [uf, tipo];
  } else {
    medSql = agrupar
      ? `SELECT COALESCE(d.principio_ativo, f.medicamento) AS medicamento, sum(f.itens)::bigint AS itens
           FROM prescricao.fato_receita_medicamento_mes f
           LEFT JOIN prescricao.de_para_medicamento d ON d.medicamento = f.medicamento
          WHERE f.mes BETWEEN to_char($1::date,'YYYY-MM')::char(7) AND to_char($2::date,'YYYY-MM')::char(7)
            AND ($3::text IS NULL OR f.sg_uf = $3)
            AND ($4::int IS NULL OR f.id_tipo_documento = $4)
          GROUP BY 1 ORDER BY itens DESC LIMIT 15`
      : `SELECT f.medicamento, sum(f.itens)::bigint AS itens
           FROM prescricao.fato_receita_medicamento_mes f
          WHERE f.mes BETWEEN to_char($1::date,'YYYY-MM')::char(7) AND to_char($2::date,'YYYY-MM')::char(7)
            AND ($3::text IS NULL OR f.sg_uf = $3)
            AND ($4::int IS NULL OR f.id_tipo_documento = $4)
          GROUP BY 1 ORDER BY itens DESC LIMIT 15`;
    medParams = p;
  }

  try {
    const [kpis, serie, porTipo, porUf, esp, origem, versao, medicamentos] = await Promise.all([
      query(
        `SELECT coalesce(sum(f.documentos),0) AS emitidos,
                coalesce(sum(f.assinados),0) AS assinados,
                coalesce(sum(f.cancelados),0) AS cancelados
           FROM prescricao.fato_documento_dia f ${WHERE_DOC}`,
        p
      ),
      query(
        `SELECT to_char(f.dia,'YYYY-MM') AS mes,
                sum(f.documentos) AS emitidos
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
      query(espSql, espParams),
      query(
        `SELECT to_char(f.dia,'YYYY-MM') AS mes,
                f.ds_origem_criacao AS origem,
                sum(f.documentos) AS documentos
           FROM prescricao.fato_documento_origem_dia f
           WHERE f.dia BETWEEN $1 AND $2
             AND ($3::text IS NULL OR f.sg_uf = $3)
             AND f.ds_origem_criacao <> 'NAO_INFORMADO'
           GROUP BY 1, 2 ORDER BY 1, 2`,
        [de, ate, uf]
      ),
      query(
        `SELECT f.ds_versao_sistema AS versao, sum(f.documentos)::bigint AS documentos
           FROM prescricao.fato_documento_versao_dia f
          WHERE f.dia BETWEEN $1 AND $2
            AND ($3::text IS NULL OR f.sg_uf = $3)
            AND f.ds_versao_sistema <> 'NAO_INFORMADO'
          GROUP BY 1 ORDER BY documentos DESC`,
        [de, ate, uf]
      ),
      query(medSql, medParams),
    ]);

    const k = kpis.rows[0];
    const emitidos = Number(k.emitidos);
    const assinados = Number(k.assinados);
    return NextResponse.json({
      de,
      ate,
      kpis: {
        emitidos,
        assinados,
        nao_assinados: emitidos - assinados,
        pct_assinatura: emitidos > 0 ? Math.round((assinados / emitidos) * 1000) / 10 : 0,
        cancelados: Number(k.cancelados),
      },
      serie_mensal: serie.rows,
      serie_origem: origem.rows,
      totais_versao: versao.rows,
      por_tipo: porTipo.rows,
      por_uf: porUf.rows,
      ranking_especialidade: esp.rows,
      ranking_medicamentos: medicamentos.rows,
    });
  } catch (e) {
    return NextResponse.json({ erro: String(e) }, { status: 500 });
  }
}
