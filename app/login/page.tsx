import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { ClipboardList, Fish, MapPinned, ShieldCheck } from "lucide-react";
import { AppLogo } from "@/components/brand/app-logo";
import { getCurrentProfile } from "@/lib/auth";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Sign in" };

const ERRORS: Record<string, string> = {
  not_admin: "This account does not have admin access. Ask an administrator to grant the admin role.",
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: { next?: string; error?: string };
}) {
  const profile = await getCurrentProfile();
  if (profile?.role === "admin") redirect(safeNext(searchParams.next));

  return (
    <main className="grid min-h-screen lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]">
      <section className="hidden flex-col justify-between bg-sidebar p-10 text-sidebar-foreground lg:flex">
        <Brand />
        <div className="max-w-md space-y-8">
          <div className="space-y-3">
            <h1 className="text-3xl font-semibold leading-tight tracking-tight">
              Every catch traced, every reef protected.
            </h1>
            <p className="text-sidebar-muted">
              Catch traceability and coastal resource management for the small-scale fishers of Marinduque.
            </p>
          </div>
          <ul className="space-y-4 text-sm">
            <Feature icon={ClipboardList} title="Recorded catch" text="Each log keeps who, where, when, and from which zone." />
            <Feature icon={MapPinned} title="Managed zones" text="Restricted areas, sanctuaries and advisories checked on every log." />
            <Feature icon={ShieldCheck} title="Faster response" text="Flagged logs and community reports in one queue for review." />
          </ul>
        </div>
        <p className="text-xs text-sidebar-muted">For LGU, MAO, BFAR and Bantay Dagat staff.</p>
      </section>

      <section className="flex items-center justify-center px-4 py-12 sm:px-8">
        <div className="w-full max-w-sm space-y-8">
          <div className="lg:hidden">
            <Brand />
          </div>
          <div className="space-y-1">
            <h2 className="text-2xl font-semibold tracking-tight">Sign in to the dashboard</h2>
            <p className="text-sm text-muted-foreground">Admin accounts only.</p>
          </div>
          <LoginForm next={safeNext(searchParams.next)} initialError={ERRORS[searchParams.error ?? ""]} />
        </div>
      </section>
    </main>
  );
}

function Brand() {
  return (
    <div className="flex items-center gap-2">
      <AppLogo />
      <span className="text-lg font-semibold tracking-tight">MarAIne</span>
    </div>
  );
}

function Feature({ icon: Icon, title, text }: { icon: typeof Fish; title: string; text: string }) {
  return (
    <li className="flex gap-3">
      <Icon className="mt-0.5 size-4 shrink-0 text-sidebar-active" aria-hidden />
      <span>
        <span className="font-medium">{title}.</span> <span className="text-sidebar-muted">{text}</span>
      </span>
    </li>
  );
}

/** Only allow redirects back into the admin area. */
function safeNext(next: string | undefined) {
  return next && next.startsWith("/admin") ? next : "/admin";
}
