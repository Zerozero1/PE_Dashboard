import type { NextAuthOptions } from "next-auth";
import GoogleProvider from "next-auth/providers/google";
import { headers } from "next/headers";
import { registrarAcesso } from "@/lib/audit";

export const ALLOWED_DOMAIN = "portalmedico.org.br";
const SESSION_MAX_AGE_SECONDS = 12 * 60 * 60;

export const authOptions: NextAuthOptions = {
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID ?? "",
      clientSecret: process.env.GOOGLE_CLIENT_SECRET ?? "",
      authorization: { params: { scope: "openid email profile" } },
    }),
  ],
  session: { strategy: "jwt", maxAge: SESSION_MAX_AGE_SECONDS },
  jwt: { maxAge: SESSION_MAX_AGE_SECONDS },
  // Em servidor corporativo atrás de reverse-proxy, defina NEXTAUTH_URL com a
  // URL pública/canônica (o cookie e o callback dependem dela). Em dev, a
  // inferência automática funciona localmente.
  pages: { signIn: "/login" },
  callbacks: {
    async jwt({ token, user }) {
      const agora = Math.floor(Date.now() / 1000);
      const autenticadoEm = user
        ? agora
        : typeof token.autenticadoEm === "number"
          ? token.autenticadoEm
          : null;
      if (autenticadoEm === null || agora - autenticadoEm >= SESSION_MAX_AGE_SECONDS) {
        // Rejeita também tokens antigos, emitidos antes do registro do horário de autenticação.
        delete token.email;
      } else {
        token.autenticadoEm = autenticadoEm;
      }
      return token;
    },
    async signIn({ user }) {
      const email = (user.email ?? "").toLowerCase();
      const ok = email.endsWith(`@${ALLOWED_DOMAIN}`);
      const ip = await extrairIp();
      await registrarAcesso(email || "(sem email)", ok, ip);
      return ok;
    },
    async session({ session, token }) {
      if (session.user) {
        const autenticadoEm = typeof token.autenticadoEm === "number" ? token.autenticadoEm : null;
        const expirou = autenticadoEm === null || Math.floor(Date.now() / 1000) - autenticadoEm >= SESSION_MAX_AGE_SECONDS;
        session.user.email = expirou ? null : token.email ?? session.user.email;
      }
      return session;
    },
  },
};

async function extrairIp(): Promise<string | null> {
  try {
    const h = await headers();
    return h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? h.get("x-real-ip") ?? null;
  } catch {
    return null;
  }
}

