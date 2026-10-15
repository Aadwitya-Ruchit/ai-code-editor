import { auth } from "@/auth";
import { SidebarProvider } from "@/components/ui/sidebar";
import { redirect } from "next/navigation";

export default async function PlaygroundLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/auth/sign-in");
  }

  return <SidebarProvider>{children}</SidebarProvider>;
}
