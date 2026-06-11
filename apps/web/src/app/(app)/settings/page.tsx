"use client";

import * as React from "react";
import { useSearchParams } from "next/navigation";
import { signOut } from "next-auth/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Crown, ExternalLink, Loader2, ShieldAlert } from "lucide-react";
import { toast } from "sonner";
import type { AlertType, StoreCode, UserProfile } from "@smart-grocery/shared";
import { DIETARY_RESTRICTIONS, STORE_INFO, formatSGD } from "@smart-grocery/shared";

import { TagInput } from "@/components/tag-input";
import { ThemeToggle } from "@/components/theme-toggle";
import { UsageMeter, type UsageRow } from "@/components/usage-meter";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { api } from "@/lib/api";
import { getErrorMessage, handleApiError } from "@/lib/errors";
import { formatDate } from "@/lib/format";
import { useUpgradePrompt } from "@/stores/upgrade-store";
import { cn } from "@/lib/utils";

const STORE_CODES = Object.keys(STORE_INFO) as StoreCode[];

const ALERT_META: Record<AlertType, { label: string; description: string; thresholdLabel?: string }> = {
  PRICE_DROP: {
    label: "Price drops",
    description: "When a watched product falls below your target or drops sharply.",
    thresholdLabel: "Min drop %",
  },
  PROMOTION: {
    label: "Promotions",
    description: "New promos on products you watch or cook with.",
  },
  EXPIRING_INGREDIENT: {
    label: "Expiring food",
    description: "A daily digest of pantry items about to expire.",
    thresholdLabel: "Days before",
  },
  BUDGET_OVERRUN: {
    label: "Budget overruns",
    description: "Weekly check that your spending stayed within budget.",
  },
};

interface AlertRow {
  type: AlertType;
  enabled: boolean;
  threshold: number | null;
  channel: "in_app" | "email" | "both";
}

interface SubscriptionInfo {
  tier: "FREE" | "PREMIUM";
  status: string;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
}

function Section({ title, description, children }: { title: string; description?: string; children: React.ReactNode }) {
  return (
    <Card>
      <CardContent className="space-y-4 p-5">
        <div>
          <h2 className="font-semibold">{title}</h2>
          {description && <p className="text-sm text-muted-foreground">{description}</p>}
        </div>
        {children}
      </CardContent>
    </Card>
  );
}

export default function SettingsPage() {
  return (
    <React.Suspense fallback={<Skeleton className="mx-auto h-72 max-w-3xl rounded-xl" />}>
      <SettingsContent />
    </React.Suspense>
  );
}

function SettingsContent() {
  const qc = useQueryClient();
  const params = useSearchParams();
  const upgrade = useUpgradePrompt();

  React.useEffect(() => {
    const billing = params.get("billing");
    if (billing === "success") {
      toast.success("Welcome to Premium! Your subscription is active.");
      qc.invalidateQueries({ queryKey: ["subscription"] });
    } else if (billing === "cancelled") {
      toast.info("Checkout cancelled — you're still on the free plan.");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const { data: profile, isLoading: profileLoading } = useQuery({
    queryKey: ["profile"],
    queryFn: () => api<UserProfile>("/users/me"),
  });

  const { data: subscription } = useQuery({
    queryKey: ["subscription"],
    queryFn: () => api<SubscriptionInfo>("/billing/subscription"),
  });

  const { data: usage } = useQuery({
    queryKey: ["usage"],
    queryFn: () => api<UsageRow[]>("/billing/usage"),
  });

  const { data: alerts } = useQuery({
    queryKey: ["alerts"],
    queryFn: () => api<AlertRow[]>("/alerts"),
  });

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      {profileLoading || !profile ? (
        <>
          <Skeleton className="h-72 rounded-xl" />
          <Skeleton className="h-48 rounded-xl" />
        </>
      ) : (
        <>
          <ProfileSection profile={profile} />
          <NotificationsSection alerts={alerts ?? []} isPremium={profile.tier === "PREMIUM"} />
          <BillingSection
            subscription={subscription}
            usage={usage ?? []}
            onUpgrade={() => upgrade.show()}
          />
          <Section title="Appearance">
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">Switch between light and dark mode.</p>
              <ThemeToggle />
            </div>
          </Section>
          <DangerZone email={profile.email} />
        </>
      )}
    </div>
  );
}

function ProfileSection({ profile }: { profile: UserProfile }) {
  const qc = useQueryClient();
  const [name, setName] = React.useState(profile.name);
  const [household, setHousehold] = React.useState(String(profile.householdSize));
  const [budget, setBudget] = React.useState(
    profile.weeklyBudgetCents !== null ? String(profile.weeklyBudgetCents / 100) : "",
  );
  const [restrictions, setRestrictions] = React.useState<string[]>(profile.dietaryRestrictions);
  const [allergies, setAllergies] = React.useState<string[]>(profile.allergies);
  const [stores, setStores] = React.useState<StoreCode[]>(profile.preferredStores);

  const save = useMutation({
    mutationFn: () =>
      api<UserProfile>("/users/me", {
        method: "PATCH",
        body: {
          name: name.trim(),
          householdSize: Number(household) || 1,
          weeklyBudgetCents: budget === "" ? null : Math.round(Number(budget) * 100),
          dietaryRestrictions: restrictions,
          allergies,
          preferredStores: stores,
        },
      }),
    onSuccess: () => {
      toast.success("Profile saved");
      qc.invalidateQueries({ queryKey: ["profile"] });
    },
    onError: (e) => handleApiError(e, "Could not save your profile"),
  });

  const toggleStore = (code: StoreCode) =>
    setStores((s) => (s.includes(code) ? s.filter((c) => c !== code) : [...s, code]));

  return (
    <Section title="Profile" description="Used to personalise baskets, plans and recommendations.">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="set-name">Name</Label>
          <Input id="set-name" value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="set-email">Email</Label>
          <Input id="set-email" value={profile.email} disabled />
        </div>
        <div className="space-y-2">
          <Label htmlFor="set-household">Household size</Label>
          <Input
            id="set-household"
            type="number"
            min="1"
            max="20"
            value={household}
            onChange={(e) => setHousehold(e.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="set-budget">Weekly grocery budget (S$)</Label>
          <Input
            id="set-budget"
            type="number"
            min="0"
            step="5"
            placeholder="No budget set"
            value={budget}
            onChange={(e) => setBudget(e.target.value)}
          />
        </div>
      </div>

      <div className="space-y-2">
        <Label>Dietary restrictions</Label>
        <div className="flex flex-wrap gap-1.5">
          {DIETARY_RESTRICTIONS.map((r) => (
            <button
              key={r}
              type="button"
              onClick={() =>
                setRestrictions((cur) => (cur.includes(r) ? cur.filter((x) => x !== r) : [...cur, r]))
              }
              className={cn(
                "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
                restrictions.includes(r)
                  ? "border-primary bg-primary text-primary-foreground"
                  : "hover:bg-accent",
              )}
              aria-pressed={restrictions.includes(r)}
            >
              {r}
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="set-allergies">Allergies</Label>
        <TagInput
          id="set-allergies"
          value={allergies}
          onChange={setAllergies}
          placeholder="e.g. peanuts, shellfish — press Enter to add"
          aria-label="Allergies"
        />
      </div>

      <div className="space-y-2">
        <Label>Preferred stores</Label>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {STORE_CODES.map((code) => (
            <label
              key={code}
              className="flex cursor-pointer items-center gap-2 rounded-lg border p-2.5 text-sm transition-colors hover:bg-accent/50"
            >
              <Checkbox
                checked={stores.includes(code)}
                onCheckedChange={() => toggleStore(code)}
                aria-label={STORE_INFO[code].name}
              />
              <span className="truncate">{STORE_INFO[code].name}</span>
            </label>
          ))}
        </div>
        <p className="text-xs text-muted-foreground">
          Leave all unchecked to compare across every store.
        </p>
      </div>

      <div className="flex justify-end">
        <Button onClick={() => save.mutate()} disabled={save.isPending}>
          {save.isPending ? "Saving…" : "Save profile"}
        </Button>
      </div>
    </Section>
  );
}

function NotificationsSection({ alerts, isPremium }: { alerts: AlertRow[]; isPremium: boolean }) {
  const qc = useQueryClient();
  const upgrade = useUpgradePrompt();

  const update = useMutation({
    mutationFn: (row: AlertRow) =>
      api("/alerts", {
        method: "PUT",
        body: {
          type: row.type,
          enabled: row.enabled,
          ...(row.threshold !== null ? { threshold: row.threshold } : {}),
          channel: row.channel,
        },
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["alerts"] }),
    onError: (e) => {
      handleApiError(e, "Could not update the alert");
      qc.invalidateQueries({ queryKey: ["alerts"] });
    },
  });

  const rows: AlertRow[] = (Object.keys(ALERT_META) as AlertType[]).map(
    (type) =>
      alerts.find((a) => a.type === type) ?? { type, enabled: false, threshold: null, channel: "in_app" },
  );

  return (
    <Section
      title="Notifications"
      description={isPremium ? "Choose what we alert you about." : "Alerts are a Premium feature."}
    >
      <div className="space-y-4">
        {rows.map((row) => {
          const meta = ALERT_META[row.type];
          return (
            <div key={row.type} className="flex flex-wrap items-center justify-between gap-3">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium">{meta.label}</p>
                <p className="text-xs text-muted-foreground">{meta.description}</p>
              </div>
              <div className="flex items-center gap-3">
                {row.enabled && meta.thresholdLabel && (
                  <div className="flex items-center gap-1.5">
                    <Label htmlFor={`thr-${row.type}`} className="text-xs text-muted-foreground">
                      {meta.thresholdLabel}
                    </Label>
                    <Input
                      id={`thr-${row.type}`}
                      type="number"
                      min="1"
                      className="h-8 w-16"
                      defaultValue={row.threshold ?? (row.type === "PRICE_DROP" ? 10 : 3)}
                      onBlur={(e) =>
                        update.mutate({ ...row, threshold: Number(e.target.value) || null })
                      }
                    />
                  </div>
                )}
                {row.enabled && (
                  <Select
                    value={row.channel}
                    onValueChange={(v) => update.mutate({ ...row, channel: v as AlertRow["channel"] })}
                  >
                    <SelectTrigger className="h-8 w-28" aria-label={`${meta.label} channel`}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="in_app">In-app</SelectItem>
                      <SelectItem value="email">Email</SelectItem>
                      <SelectItem value="both">Both</SelectItem>
                    </SelectContent>
                  </Select>
                )}
                <Switch
                  checked={row.enabled}
                  aria-label={`Toggle ${meta.label}`}
                  onCheckedChange={(checked) => {
                    if (checked && !isPremium) {
                      upgrade.show("Alerts are part of Premium — never miss a price drop again.");
                      return;
                    }
                    update.mutate({ ...row, enabled: checked });
                  }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </Section>
  );
}

function BillingSection({
  subscription,
  usage,
  onUpgrade,
}: {
  subscription: SubscriptionInfo | undefined;
  usage: UsageRow[];
  onUpgrade: () => void;
}) {
  const portal = useMutation({
    mutationFn: () => api<{ url: string }>("/billing/portal", { method: "POST" }),
    onSuccess: (d) => {
      window.location.href = d.url;
    },
    onError: (e) => toast.error(getErrorMessage(e, "Could not open the billing portal")),
  });

  const isPremium = subscription?.tier === "PREMIUM";

  return (
    <Section title="Billing">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-4">
        <div className="flex items-center gap-3">
          <div
            className={cn(
              "flex h-10 w-10 items-center justify-center rounded-full",
              isPremium ? "bg-amber-100 dark:bg-amber-900/50" : "bg-muted",
            )}
          >
            <Crown
              className={cn("h-5 w-5", isPremium ? "text-amber-600 dark:text-amber-400" : "text-muted-foreground")}
              aria-hidden
            />
          </div>
          <div>
            <p className="flex items-center gap-2 font-medium">
              {isPremium ? "Premium" : "Free plan"}
              {isPremium && subscription?.cancelAtPeriodEnd && (
                <Badge variant="secondary">Cancels {subscription.currentPeriodEnd ? formatDate(subscription.currentPeriodEnd) : "soon"}</Badge>
              )}
            </p>
            <p className="text-xs text-muted-foreground">
              {isPremium
                ? subscription?.currentPeriodEnd
                  ? `Renews ${formatDate(subscription.currentPeriodEnd)}`
                  : "Active subscription"
                : `Upgrade for ${formatSGD(790)}/month — unlimited everything.`}
            </p>
          </div>
        </div>
        {isPremium ? (
          <Button variant="outline" onClick={() => portal.mutate()} disabled={portal.isPending}>
            {portal.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <ExternalLink aria-hidden />}
            Manage billing
          </Button>
        ) : (
          <Button onClick={onUpgrade}>
            <Crown aria-hidden /> Upgrade
          </Button>
        )}
      </div>

      {!isPremium && usage.length > 0 && (
        <>
          <Separator />
          <div className="space-y-3">
            <p className="text-sm font-medium">Free plan usage</p>
            {usage.map((u) => (
              <UsageMeter key={u.kind} usage={u} />
            ))}
          </div>
        </>
      )}
    </Section>
  );
}

function DangerZone({ email }: { email: string }) {
  const [open, setOpen] = React.useState(false);
  const [confirmation, setConfirmation] = React.useState("");

  const remove = useMutation({
    mutationFn: () => api("/users/me", { method: "DELETE" }),
    onSuccess: async () => {
      toast.success("Your account has been deleted");
      await signOut({ callbackUrl: "/" });
    },
    onError: (e) => handleApiError(e, "Could not delete your account"),
  });

  return (
    <Card className="border-destructive/40">
      <CardContent className="flex flex-wrap items-center justify-between gap-3 p-5">
        <div className="flex items-start gap-3">
          <ShieldAlert className="mt-0.5 h-5 w-5 text-destructive" aria-hidden />
          <div>
            <h2 className="font-semibold">Delete account</h2>
            <p className="text-sm text-muted-foreground">
              Permanently removes your recipes, pantry, baskets and history.
            </p>
          </div>
        </div>
        <Button variant="destructive" onClick={() => setOpen(true)}>
          Delete account
        </Button>
      </CardContent>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>This cannot be undone</DialogTitle>
            <DialogDescription>
              All data for <span className="font-medium">{email}</span> will be permanently deleted. Type{" "}
              <span className="font-mono font-semibold">DELETE</span> to confirm.
            </DialogDescription>
          </DialogHeader>
          <Input
            value={confirmation}
            onChange={(e) => setConfirmation(e.target.value)}
            placeholder="DELETE"
            aria-label="Type DELETE to confirm"
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Keep my account
            </Button>
            <Button
              variant="destructive"
              disabled={confirmation !== "DELETE" || remove.isPending}
              onClick={() => remove.mutate()}
            >
              {remove.isPending ? "Deleting…" : "Delete forever"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
