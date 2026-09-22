import type { NextAuthOptions } from "next-auth";
import GoogleProvider from "next-auth/providers/google";

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
  pages: { signIn: "/api/auth/signin" },
  callbacks: {
    async signIn({ user }) {
      const email = user.email ?? "";
      return email.toLowerCase().endsWith(`@${ALLOWED_DOMAIN}`);
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.email = token.email ?? session.user.email;
      }
      return session;
    },
  },
};
