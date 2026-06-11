"use client";

import * as React from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useMutation } from "@tanstack/react-query";
import { CheckCircle2, Loader2, MailWarning, MailX } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { api } from "@/lib/api";
import { getErrorMessage } from "@/lib/errors";

type State = "verifying" | "success" | "failed" | "missing";

function VerifyEmailInner() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token");
  const [state, setState] = React.useState<State>(token ? "verifying" : "missing");
  const [email, setEmail] = React.useState("");
  const ran = React.useRef(false);

  React.useEffect(() => {
    if (!token || ran.current) return;
    ran.current = true;
    api("/auth/verify-email", { method: "POST", body: { token }, anonymous: true })
      .then(() => setState("success"))
      .catch(() => setState("failed"));
  }, [token]);

  const resend = useMutation({
    mutationFn: () =>
      api("/auth/forgot-password", {
        method: "POST",
        body: { email },
        anonymous: true,
      }),
    onSuccess: () => toast.success("If that email exists, a new link is on its way."),
    onError: (e) => toast.error(getErrorMessage(e)),
  });

  if (state === "verifying") {
    return (
      <Card>
        <CardContent className="flex flex-col items-center gap-4 p-10 text-center">
          <Loader2 className="h-8 w-8 animate-spin text-primary" aria-hidden />
          <p className="font-medium">Verifying your email…</p>
        </CardContent>
      </Card>
    );
  }

  if (state === "success") {
    return (
      <Card>
        <CardContent className="flex flex-col items-center gap-4 p-10 text-center">
          <CheckCircle2 className="h-10 w-10 text-emerald-500" aria-hidden />
          <div>
            <p className="text-lg font-semibold">Email verified</p>
            <p className="mt-1 text-sm text-muted-foreground">
              You&apos;re all set — log in to start saving.
            </p>
          </div>
          <Button asChild className="w-full">
            <Link href="/login">Go to login</Link>
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="items-center text-center">
        {state === "failed" ? (
          <MailX className="h-10 w-10 text-destructive" aria-hidden />
        ) : (
          <MailWarning className="h-10 w-10 text-amber-500" aria-hidden />
        )}
        <CardTitle className="text-xl">
          {state === "failed" ? "Verification failed" : "Missing verification link"}
        </CardTitle>
        <CardDescription>
          {state === "failed"
            ? "This link is invalid or has expired. Enter your email to receive a new one."
            : "Open the link from your verification email, or request a new one below."}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="space-y-1.5">
          <Label htmlFor="resend-email">Email</Label>
          <Input
            id="resend-email"
            type="email"
            placeholder="you@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>
        <Button
          className="w-full"
          disabled={!email || resend.isPending}
          onClick={() => resend.mutate()}
        >
          {resend.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
          Resend verification email
        </Button>
        <p className="text-center text-sm text-muted-foreground">
          <Link href="/login" className="text-primary underline-offset-4 hover:underline">
            Back to login
          </Link>
        </p>
      </CardContent>
    </Card>
  );
}

export default function VerifyEmailPage() {
  return (
    <React.Suspense
      fallback={
        <Card>
          <CardContent className="space-y-4 p-6">
            <Skeleton className="h-10 w-10 rounded-full" />
            <Skeleton className="h-6 w-48" />
            <Skeleton className="h-9 w-full" />
          </CardContent>
        </Card>
      }
    >
      <VerifyEmailInner />
    </React.Suspense>
  );
}
