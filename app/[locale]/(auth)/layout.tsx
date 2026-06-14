import { SettingsSheet } from "@/components/layout/SettingsSheet";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative flex min-h-dvh flex-col items-center justify-center bg-muted/40 px-4 py-10">
      <div className="absolute right-4 top-4 flex justify-end">
        <SettingsSheet />
      </div>
      <div className="w-full max-w-md rounded-lg border bg-card p-8 shadow-sm">{children}</div>
    </div>
  );
}
