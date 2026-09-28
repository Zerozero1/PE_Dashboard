import type { NextAuthOptions } from "next-auth";
import GoogleProvider from "next-auth/providers/google";
import { headers } from "next/headers";
import { registrarAcesso } from "@/lib/audit";

export const ALLOWED_DOMAIN = "portalmedico.org.br";

export const authOptions: NextAuthOptions = {
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID ?? "",
      clientSecret: process.env.GOOGLE_CLIENT_SECRET ?? "",
      authorization: { params: { scope: "openid email profile" } },
    }),
  ],
  session: { strategy: "jwt" },
  // Em servidor corporativo atrás de reverse-proxy, defina NEXTAUTH_URL com a
  // URL pública/canônica (o cookie e o callback dependem dela). Em dev, a
  // inferência automática funciona localmente.
  pages: { signIn: "/login" },
  callbacks: {
    async signIn({ user }) {
      const email = (user.email ?? "").toLowerCase();
      const ok = email.endsWith(`@${ALLOWED_DOMAIN}`);
      const ip = await extrairIp();
      await registrarAcesso(email || "(sem email)", ok, ip);
      return ok;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.email = token.email ?? session.user.email;
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

