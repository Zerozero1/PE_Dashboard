import { NextResponse } from "next/server";
import { query } from "@/lib/db";

export async function GET() {
  try {
    const [ufs, tipos] = await Promise.all([
      query(`SELECT sg_uf AS uf FROM prescricao.dim_uf ORDER BY sg_uf`),
      query(
        `SELECT id_tipo_documento AS id, nm_documento AS nome
           FROM prescricao.dim_tipo_documento ORDER BY nm_documento`
      ),
    ]);
    return NextResponse.json({
      ufs: ufs.rows.map((r) => r.uf),
      tipos: tipos.rows,
    });
  } catch (e) {
    return NextResponse.json({ erro: String(e) }, { status: 500 });
  }
}
