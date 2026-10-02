import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";

const TODOS_DE = "2021-10-01";
const TIPOS_POOL = [5, 6, 18, 19, 20, 22];

export async function GET(req: NextRequest) {
  const url = req.nextUrl;
  const ate = url.searchParams.get("ate") ?? new Date().toISOString().slice(0, 10);
  const de = url.searchParams.get("de") ?? new Date(Date.now() - 30 * 864e5).toISOString().slice(0, 10);
  const uf = url.searchParams.get("uf") || null;
  const todos = de <= TODOS_DE;

  try {
    const [porTipo, emitentes] = await Promise.all([
      query(
        `SELECT t.nm_documento AS tipo, n.id_tipo_documento,
                count(*)::int AS medicos,
                count(*) FILTER (WHERE n.disponiveis > 0)::int AS com_estoque,
                count(*) FILTER (WHERE n.disponiveis = 0)::int AS sem_estoque,
                count(*) FILTER (WHERE n.utilizados = 0)::int AS nunca_usaram,
                count(*) FILTER (WHERE n.utilizados > 0)::int AS ja_usaram,
                sum(n.disponiveis)::bigint AS disponiveis,
                sum(n.utilizados)::bigint AS utilizados
           FROM prescricao.snap_numeracao_anvisa_medico n
           JOIN prescricao.dim_tipo_documento t ON t.id_tipo_documento = n.id_tipo_documento
          WHERE ($1::text IS NULL OR n.sg_uf = $1)
          GROUP BY 1, 2 ORDER BY disponiveis DESC`,
        [uf]
      ),
      todos
        ? query(
            `SELECT f.id_tipo_documento, count(DISTINCT f.id_medico)::int AS n
               FROM prescricao.snap_medico_tipo f
              WHERE f.id_tipo_documento = ANY($1::int[])
                AND ($2::text IS NULL OR f.sg_uf = $2)
                AND NOT EXISTS (SELECT 1 FROM prescricao.snap_numeracao_anvisa_medico n
                                 WHERE n.id_medico = f.id_medico
                                   AND n.id_tipo_documento = f.id_tipo_documento)
              GROUP BY 1`,
            [TIPOS_POOL, uf]
          )
        : query(
            `SELECT f.id_tipo_documento, count(DISTINCT f.id_medico)::int AS n
               FROM prescricao.fato_documento_medico_tipo_dia f
              WHERE f.dia BETWEEN $1 AND $2
                AND f.id_tipo_documento = ANY($3::int[])
                AND ($4::text IS NULL OR f.sg_uf = $4)
                AND NOT EXISTS (SELECT 1 FROM prescricao.snap_numeracao_anvisa_medico n
                                 WHERE n.id_medico = f.id_medico
                                   AND n.id_tipo_documento = f.id_tipo_documento)
              GROUP BY 1`,
            [de, ate, TIPOS_POOL, uf]
          ),
    ]);

    const gap = new Map<number, number>(
      emitentes.rows.map((r) => [Number(r.id_tipo_documento), Number(r.n)]));
    const por_tipo = porTipo.rows.map((r) => ({
      ...r,
      emitentes_sem_numeracao: gap.get(Number(r.id_tipo_documento)) ?? 0,
    }));
    return NextResponse.json({ de, ate, por_tipo });
  } catch (e) {
    return NextResponse.json({ erro: String(e) }, { status: 500 });
  }
}
