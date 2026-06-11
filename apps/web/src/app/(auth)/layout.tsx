import Link from "next/link";
import { Leaf } from "lucide-react";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center bg-hero-gradient px-4 py-10">
      <Link
        href="/"
        className="mb-8 flex items-center gap-2 font-semibold tracking-tight focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-md"
      >
        <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary text-primary-foreground">
          <Leaf className="h-4.5 w-4.5" aria-hidden />
        </span>
        <span className="text-lg">Smart Grocery AI</span>
      </Link>
      <div className="w-full max-w-md">{children}</div>
      <p className="mt-8 text-center text-xs text-muted-foreground">
        Compare prices across 7 Singapore supermarkets — free to start.
      </p>
    </div>
  );
}
