import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { authOptions } from "@/lib/auth";
import { query } from "@/lib/db";

const ADMIN_EMAIL = "mrichard@portalmedico.org.br";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (session?.user?.email !== ADMIN_EMAIL) {
    return NextResponse.json({ erro: "nao autorizado" }, { status: 403 });
  }

  try {
    const [acessos, jobs] = await Promise.all([
      query(
        `SELECT id_access_log, nm_email, tx_ip, in_sucesso, dh_evento
           FROM prescricao.dashboard_access_log
          ORDER BY dh_evento DESC LIMIT 500`
      ),
      query(
        `SELECT id_job, tipo, status, solicitado_por, agendado_para,
                iniciado_em, finalizado_em, mensagem
           FROM prescricao.dashboard_refresh_job
          ORDER BY id_job DESC LIMIT 500`
      ),
    ]);

    return NextResponse.json({ acessos: acessos.rows, jobs: jobs.rows });
  } catch (e) {
    return NextResponse.json({ erro: String(e) }, { status: 500 });
  }
}
