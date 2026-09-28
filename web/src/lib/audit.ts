import { query } from "@/lib/db";

export async function registrarAcesso(email: string, sucesso: boolean, ip: string | null) {
  try {
    await query(
      `INSERT INTO prescricao.dashboard_access_log (nm_email, tx_ip, in_sucesso)
       VALUES ($1, $2, $3)`,
      [email, ip, sucesso]
    );
  } catch {
    // falha ao auditar nunca deve quebrar o fluxo de login
  }
}
