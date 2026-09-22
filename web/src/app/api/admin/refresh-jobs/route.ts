import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { authOptions } from "@/lib/auth";
import { query } from "@/lib/db";

export async function POST() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ erro: "nao autorizado" }, { status: 401 });
  }

  const ativo = await query(
    `SELECT id_job, status FROM prescricao.dashboard_refresh_job
      WHERE status IN ('queued', 'running') ORDER BY id_job LIMIT 1`
  );
  if (ativo.rows.length > 0) {
    return NextResponse.json({
      status: "ja_em_execucao",
      job: ativo.rows[0],
    });
  }

  const criado = await query(
    `INSERT INTO prescricao.dashboard_refresh_job
       (tipo, solicitado_por) VALUES ('manual', $1)
     RETURNING id_job, status`,
    [session.user.email]
  );
  return NextResponse.json({ status: "queued", job: criado.rows[0] });
}
