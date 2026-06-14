import { redirect } from "next/navigation";

import { auth } from "@/auth";

export default async function HomePage({ params }: { params: { locale: string } }) {
  const { locale } = params;
  const session = await auth();
  if (session) redirect(`/${locale}/dashboard`);
  redirect(`/${locale}/login`);
}
