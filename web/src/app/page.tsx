import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import Dashboard from "@/components/dashboard";

export default async function Page() {
  const session = await getServerSession(authOptions);

  if (!session?.user?.email) {
    if (process.env.NODE_ENV === "development" && !process.env.GOOGLE_CLIENT_ID) {
      return <Dashboard email="mrichard@portalmedico.org.br" mock />;
    }
    redirect("/login?callbackUrl=/");
  }

  return <Dashboard email={session.user.email} />;
}
