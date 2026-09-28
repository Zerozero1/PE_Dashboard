import { getServerSession } from "next-auth";
import { NextRequest, NextResponse } from "next/server";
import { authOptions } from "@/lib/auth";
import { query } from "@/lib/db";

const ADMIN_EMAIL = "mrichard@portalmedico.org.br";

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (session?.user?.email !== ADMIN_EMAIL) {
    return NextResponse.json({ erro: "nao autorizado" }, { status: 403 });
  }

  const { alvo } = await req.json().catch(() => ({ alvo: null }));

  try {
    if (alvo === "acessos") {
      await query(`TRUNCATE prescricao.dashboard_access_log`);
    } else if (alvo === "jobs") {
      await query(`TRUNCATE prescricao.dashboard_refresh_job`);
    } else {
      return NextResponse.json({ erro: "alvo invalido" }, { status: 400 });
    }
    return NextResponse.json({ status: "ok" });
  } catch (e) {
    return NextResponse.json({ erro: String(e) }, { status: 500 });
  }
}
