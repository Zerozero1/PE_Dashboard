import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { query } from "@/lib/db";

export async function GET(req: NextRequest) {
  const url = req.nextUrl;
  const idMedicoRaw = Number(url.searchParams.get("id_medico"));
  const idMedico = Number.isInteger(idMedicoRaw) ? idMedicoRaw : null;
  const idPessoaRaw = Number(url.searchParams.get("id_pessoa"));
  const idPessoa = Number.isInteger(idPessoaRaw) ? idPessoaRaw : null;
  const anomalia = url.searchParams.get("anomalia") ?? "AN1";
  const ate = url.searchParams.get("ate") ?? new Date().toISOString().slice(0, 10);
  const de = url.searchParams.get("de") ?? new Date(Date.now() - 30 * 864e5).toISOString().slice(0, 10);
  const uf = url.searchParams.get("uf") || null;
  const tipo = url.searchParams.get("tipo") || null;

  try {
    if (anomalia === "AN3") {
      const session = await getServerSession(authOptions);
      const devMock = process.env.NODE_ENV === "development" && !process.env.GOOGLE_CLIENT_ID;
      if (!session?.user?.email && !devMock) {
        return NextResponse.json({ erro: "Não autenticado" }, { status: 401 });
      }
      if (idPessoa === null || idPessoa <= 0) {
        return NextResponse.json({ erro: "id_pessoa invalido" }, { status: 400 });
      }

      const [medico, eventos] = await Promise.all([
        query(
          `SELECT max(nm_medico) AS nome,
                  string_agg(
                    DISTINCT (nu_crm || '/' || btrim(sg_uf)),
                    ', ' ORDER BY (nu_crm || '/' || btrim(sg_uf))
                  ) AS inscricoes
             FROM prescricao.dim_medico
            WHERE id_pessoa = $1`,
          [idPessoa]
        ),
        query(
          `WITH sinais AS (
             SELECT f.id_consulta_documento, f.dh_documento,
                    m.nu_crm AS crm, m.sg_uf AS crm_uf,
                    t.nm_documento AS tipo,
                    COALESCE(NULLIF(u.nm_unidade, ''), 'UNIDADE:' || f.id_unidade_atendimento::text) AS instituicao,
                    NULLIF(u.co_cnes, '') AS cnes,
                    f.id_unidade_atendimento,
                    f.sg_uf AS uf,
                    CASE WHEN $5::int IS NULL THEN f.gap_pessoa_seg ELSE f.gap_tipo_seg END AS intervalo_seg,
                    CASE WHEN $5::int IS NULL THEN f.docs_60s ELSE f.docs_60s_tipo END AS docs_60s,
                    concat_ws(' + ',
                      CASE WHEN (($5::int IS NULL AND f.gap_pessoa_seg BETWEEN 0 AND 5)
                                 OR ($5::int IS NOT NULL AND f.gap_tipo_seg BETWEEN 0 AND 5))
                           THEN 'intervalo ≤5s' END,
                      CASE WHEN (($5::int IS NULL AND f.docs_60s >= 10)
                                 OR ($5::int IS NOT NULL AND f.docs_60s_tipo >= 10))
                           THEN 'pico ≥10/60s' END
                    ) AS sinal
               FROM prescricao.fato_an3_emissao_detalhe f
               JOIN prescricao.dim_medico m ON m.id_medico = f.id_medico
               JOIN prescricao.dim_tipo_documento t ON t.id_tipo_documento = f.id_tipo_documento
               LEFT JOIN prescricao.dim_unidade u ON u.id_unidade_atendimento = f.id_unidade_atendimento
              WHERE f.id_pessoa = $1
                AND f.dh_documento >= $2::date
                AND f.dh_documento < ($3::date + interval '1 day')
                AND ($4::text IS NULL OR f.sg_uf = $4)
                AND ($5::int IS NULL OR f.id_tipo_documento = $5)
                AND (($5::int IS NULL AND (f.gap_pessoa_seg BETWEEN 0 AND 5 OR f.docs_60s >= 10))
                  OR ($5::int IS NOT NULL AND (f.gap_tipo_seg BETWEEN 0 AND 5 OR f.docs_60s_tipo >= 10)))
           ), pagina AS (
             SELECT row_number() OVER (ORDER BY dh_documento, id_consulta_documento)::int AS sequencia,
                    to_char(dh_documento, 'YYYY-MM-DD HH24:MI:SS.MS') AS data_hora,
                    crm, crm_uf, tipo, instituicao, cnes, id_unidade_atendimento, uf,
                    intervalo_seg, docs_60s, sinal,
                    count(*) OVER() AS total_eventos
               FROM sinais
           )
         SELECT sequencia, data_hora, crm, crm_uf, tipo, instituicao, cnes,
                id_unidade_atendimento, uf, intervalo_seg, docs_60s, sinal,
                total_eventos
           FROM pagina
          ORDER BY sequencia
          LIMIT $6`,
          [idPessoa, de, ate, uf, tipo, 1000]
        ),
      ]);

      const totalEventos = Number(eventos.rows[0]?.total_eventos ?? 0);
      const eventosSemTotal = eventos.rows.map(({ total_eventos: _total, ...row }) => row);

      return NextResponse.json({
        id_pessoa: idPessoa,
        medico: medico.rows[0] ?? { nome: null, inscricoes: null },
        eventos: eventosSemTotal,
        total_eventos: totalEventos,
        eventos_truncados: totalEventos > eventos.rows.length,
      });
    }

    if (idMedico === null || idMedico <= 0) {
      return NextResponse.json({ erro: "id_medico invalido" }, { status: 400 });
    }

    const medicoQ = query(
      `SELECT m.nm_medico AS nome, m.nu_crm AS crm, m.sg_uf AS crm_uf,
              m.in_situacao AS situacao, m.in_tipo_inscricao AS tipo_inscricao
         FROM prescricao.dim_medico m
        WHERE m.id_medico = $1`,
      [idMedico]
    );

    const especialidadesQ = query(
      `SELECT e.ds_especialidade AS esp
         FROM prescricao.dim_especialidade e
        WHERE e.id_medico = $1 AND e.ds_especialidade IS NOT NULL
        ORDER BY 1`,
      [idMedico]
    );

    let porTipoQ: ReturnType<typeof query>;
    let serieMensalQ: ReturnType<typeof query>;
    let totalPacientesQ: ReturnType<typeof query>;

    if (anomalia === "AN2") {
      porTipoQ = query("SELECT NULL::text AS tipo, NULL::bigint AS docs LIMIT 0");
      serieMensalQ = query(
        `SELECT to_char(f.dia,'YYYY-MM') AS mes, count(DISTINCT f.id_paciente)::bigint AS docs
           FROM prescricao.fato_documento_medico_paciente_dia f
          WHERE f.id_medico = $1
            AND f.dia BETWEEN $2 AND $3
            AND ($4::text IS NULL OR f.sg_uf = $4)
          GROUP BY 1 ORDER BY 1`,
        [idMedico, de, ate, uf]
      );
      totalPacientesQ = query(
        `SELECT count(DISTINCT f.id_paciente)::bigint AS total
           FROM prescricao.fato_documento_medico_paciente_dia f
          WHERE f.id_medico = $1
            AND f.dia BETWEEN $2 AND $3
            AND ($4::text IS NULL OR f.sg_uf = $4)`,
        [idMedico, de, ate, uf]
      );
    } else {
      porTipoQ = query(
        `SELECT t.nm_documento AS tipo, sum(f.documentos) AS docs
           FROM prescricao.fato_documento_medico_tipo_dia f
           JOIN prescricao.dim_tipo_documento t ON t.id_tipo_documento = f.id_tipo_documento
          WHERE f.id_medico = $1
            AND f.dia BETWEEN $2 AND $3
            AND ($4::text IS NULL OR f.sg_uf = $4)
          GROUP BY 1 ORDER BY 2 DESC`,
        [idMedico, de, ate, uf]
      );
      serieMensalQ = query(
        `SELECT to_char(f.dia,'YYYY-MM') AS mes, sum(f.documentos) AS docs
           FROM prescricao.fato_documento_medico_tipo_dia f
          WHERE f.id_medico = $1
            AND f.dia BETWEEN $2 AND $3
            AND ($4::text IS NULL OR f.sg_uf = $4)
          GROUP BY 1 ORDER BY 1`,
        [idMedico, de, ate, uf]
      );
      totalPacientesQ = query("SELECT NULL::bigint AS total LIMIT 0");
    }

    const [medico, porTipo, serieMensal, especialidades, totalPacientes] = await Promise.all([
      medicoQ, porTipoQ, serieMensalQ, especialidadesQ, totalPacientesQ,
    ]);

    return NextResponse.json({
      medico: medico.rows[0] ?? null,
      por_tipo: porTipo.rows,
      serie_mensal: serieMensal.rows,
      especialidades: especialidades.rows.map((r) => r.esp),
      total_pacientes: anomalia === "AN2" ? (totalPacientes.rows[0]?.total ?? 0) : null,
    });
  } catch (e) {
    return NextResponse.json({ erro: String(e) }, { status: 500 });
  }
}
