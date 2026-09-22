import { NextResponse } from "next/server";
import { query } from "@/lib/db";

export async function GET() {
  try {
    const job = await query(
      `SELECT id_job, tipo, status, solicitado_por, iniciado_em, finalizado_em,
              mensagem
         FROM prescricao.dashboard_refresh_job
        ORDER BY id_job DESC LIMIT 1`
    );
    const config = await query(
      `SELECT horario_diario, timezone, ativo
         FROM prescricao.dashboard_refresh_config WHERE id = 1`
    );
    const docs = await query(
      `SELECT max(dia) AS ultimo_dia, sum(documentos) AS total
         FROM prescricao.fato_documento_dia`
    );
    return NextResponse.json({
      status: "ok",
      job: job.rows[0] ?? null,
      config: config.rows[0] ?? null,
      dados: docs.rows[0] ?? null,
    });
  } catch (e) {
    return NextResponse.json(
      { status: "error", erro: String(e) },
      { status: 500 }
    );
  }
}
