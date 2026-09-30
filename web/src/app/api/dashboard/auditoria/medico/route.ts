import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { query } from "@/lib/db";

export async function GET(req: NextRequest) {
  const url = req.nextUrl;
  const idMedicoRaw = Number(url.searchParams.get("id_medico"));
  const idMedico = Number.isInteger(idMedicoRaw) ? idMedicoRaw : null;
  const anomalia = url.searchParams.get("anomalia") ?? "AN1";
  const ate = url.searchParams.get("ate") ?? new Date().toISOString().slice(0, 10);
  const de = url.searchParams.get("de") ?? new Date(Date.now() - 30 * 864e5).toISOString().slice(0, 10);
  const uf = url.searchParams.get("uf") || null;

  try {
    if (anomalia === "AN3") {
      const session = await getServerSession(authOptions);
      const devMock = process.env.NODE_ENV === "development" && !process.env.GOOGLE_CLIENT_ID;
      if (!session?.user?.email && !devMock) {
        return NextResponse.json({ erro: "Não autenticado" }, { status: 401 });
      }
      if (idMedico === null || idMedico <= 0) {
        return NextResponse.json({ erro: "id_medico invalido" }, { status: 400 });
      }
      const dia = url.searchParams.get("dia");
      if (!dia || !/^\d{4}-\d{2}-\d{2}$/.test(dia)) {
        return NextResponse.json({ erro: "dia invalido" }, { status: 400 });
      }

      const medicoQ = await query(
        `SELECT m.nm_medico AS nome, m.nu_crm AS crm, m.sg_uf AS crm_uf
           FROM prescricao.dim_medico m
          WHERE m.id_medico = $1`,
        [idMedico]
      );

      const [resumo, porTipo, porUf] = await Promise.all([
        query(
          `SELECT COALESCE(sum(f.documentos), 0)::bigint AS documentos,
                  COALESCE((SELECT count(DISTINCT p.id_paciente)
                              FROM prescricao.fato_documento_medico_paciente_dia p
                             WHERE p.id_medico = $1 AND p.dia = $2), 0)::bigint AS pacientes
             FROM prescricao.fato_documento_medico_dia f
            WHERE f.id_medico = $1 AND f.dia = $2`,
          [idMedico, dia]
        ),
        query(
          `SELECT t.nm_documento AS tipo, sum(f.documentos)::bigint AS documentos
             FROM prescricao.fato_documento_medico_tipo_dia f
             JOIN prescricao.dim_tipo_documento t ON t.id_tipo_documento = f.id_tipo_documento
            WHERE f.id_medico = $1 AND f.dia = $2
            GROUP BY t.nm_documento
            ORDER BY documentos DESC`,
          [idMedico, dia]
        ),
        query(
          `SELECT f.sg_uf AS uf, sum(f.documentos)::bigint AS documentos
             FROM prescricao.fato_documento_medico_dia f
            WHERE f.id_medico = $1 AND f.dia = $2
            GROUP BY f.sg_uf
            ORDER BY documentos DESC`,
          [idMedico, dia]
        ),
      ]);

      return NextResponse.json({
        id_medico: idMedico,
        dia,
        medico: medicoQ.rows[0] ?? { nome: null, crm: null, crm_uf: null },
        resumo: resumo.rows[0] ?? { documentos: "0", pacientes: "0" },
        por_tipo: porTipo.rows,
        por_uf: porUf.rows,
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
