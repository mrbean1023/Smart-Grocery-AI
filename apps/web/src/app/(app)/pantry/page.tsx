"use client";

import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlarmClock,
  Camera,
  Check,
  Pencil,
  Plus,
  Receipt,
  Refrigerator,
  Snowflake,
  Trash2,
  Upload,
  UtensilsCrossed,
  Warehouse,
} from "lucide-react";
import { toast } from "sonner";
import type { PantryItemDto, PantryLocation } from "@smart-grocery/shared";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { api } from "@/lib/api";
import { handleApiError } from "@/lib/errors";
import { formatDate } from "@/lib/format";

const LOCATIONS: { value: PantryLocation; label: string; icon: typeof Warehouse }[] = [
  { value: "PANTRY", label: "Pantry", icon: Warehouse },
  { value: "FRIDGE", label: "Fridge", icon: Refrigerator },
  { value: "FREEZER", label: "Freezer", icon: Snowflake },
];

const UNITS = ["piece", "g", "kg", "ml", "l", "pack", "bottle", "can"];

interface ReceiptRow {
  id: string;
  status: string;
  storeCode: string | null;
  totalCents: number | null;
  createdAt: string;
  failureReason?: string | null;
}

interface ItemFormState {
  id?: string;
  name: string;
  quantity: string;
  unit: string;
  location: PantryLocation;
  expiresAt: string;
  pricePaid: string;
}

const EMPTY_FORM: ItemFormState = {
  name: "",
  quantity: "1",
  unit: "piece",
  location: "PANTRY",
  expiresAt: "",
  pricePaid: "",
};

function expiryBadge(item: PantryItemDto) {
  if (item.daysUntilExpiry === null) return null;
  const d = item.daysUntilExpiry;
  const cls =
    d < 0
      ? "bg-destructive text-white"
      : d <= 2
        ? "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300"
        : d <= 5
          ? "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300"
          : "bg-muted text-muted-foreground";
  const label = d < 0 ? "Expired" : d === 0 ? "Today" : d === 1 ? "1 day" : `${d} days`;
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${cls}`}>
      <AlarmClock className="h-3 w-3" aria-hidden />
      {label}
    </span>
  );
}

export default function PantryPage() {
  const qc = useQueryClient();
  const [formOpen, setFormOpen] = React.useState(false);
  const [scanOpen, setScanOpen] = React.useState(false);
  const [form, setForm] = React.useState<ItemFormState>(EMPTY_FORM);

  const { data: items, isLoading } = useQuery({
    queryKey: ["pantry"],
    queryFn: () => api<PantryItemDto[]>("/pantry"),
  });

  const { data: receiptsRaw } = useQuery({
    queryKey: ["receipts"],
    queryFn: () => api<ReceiptRow[] | { items: ReceiptRow[] }>("/receipts"),
  });
  const receipts = Array.isArray(receiptsRaw) ? receiptsRaw : (receiptsRaw?.items ?? []);

  const invalidate = () => qc.invalidateQueries({ queryKey: ["pantry"] });

  const saveItem = useMutation({
    mutationFn: async (f: ItemFormState) => {
      const body = {
        name: f.name.trim(),
        quantity: Number(f.quantity) || 1,
        unit: f.unit,
        location: f.location,
        expiresAt: f.expiresAt ? new Date(f.expiresAt).toISOString() : null,
        ...(f.pricePaid ? { pricePaidCents: Math.round(Number(f.pricePaid) * 100) } : {}),
      };
      return f.id
        ? api(`/pantry/${f.id}`, { method: "PATCH", body })
        : api("/pantry", { method: "POST", body });
    },
    onSuccess: () => {
      toast.success(form.id ? "Item updated" : "Item added to pantry");
      setFormOpen(false);
      setForm(EMPTY_FORM);
      invalidate();
    },
    onError: (e) => handleApiError(e, "Could not save the item"),
  });

  const itemAction = useMutation({
    mutationFn: ({ id, action }: { id: string; action: "consumed" | "wasted" | "delete" }) =>
      action === "delete"
        ? api(`/pantry/${id}`, { method: "DELETE" })
        : api(`/pantry/${id}`, { method: "PATCH", body: { [action]: true } }),
    onSuccess: (_d, v) => {
      toast.success(
        v.action === "consumed" ? "Marked as used" : v.action === "wasted" ? "Marked as wasted" : "Item removed",
      );
      invalidate();
    },
    onError: (e) => handleApiError(e),
  });

  const scan = useMutation({
    mutationFn: async ({ file, location }: { file: File; location: PantryLocation }) => {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("location", location);
      return api<PantryItemDto[]>("/pantry/scan", { method: "POST", formData: fd });
    },
    onSuccess: (created) => {
      toast.success(`Added ${created.length} item${created.length === 1 ? "" : "s"} from your photo`);
      setScanOpen(false);
      invalidate();
    },
    onError: (e) => handleApiError(e, "Scan failed — try a clearer photo"),
  });

  const uploadReceipt = useMutation({
    mutationFn: async (file: File) => {
      const fd = new FormData();
      fd.append("file", file);
      return api("/receipts/upload", { method: "POST", formData: fd });
    },
    onSuccess: () => {
      toast.success("Receipt uploaded — we'll extract the items and prices shortly");
      qc.invalidateQueries({ queryKey: ["receipts"] });
    },
    onError: (e) => handleApiError(e, "Receipt upload failed"),
  });

  const expiring = (items ?? []).filter((i) => i.daysUntilExpiry !== null && i.daysUntilExpiry <= 5);

  const openEdit = (item: PantryItemDto) => {
    setForm({
      id: item.id,
      name: item.name,
      quantity: String(item.quantity),
      unit: item.unit,
      location: item.location,
      expiresAt: item.expiresAt ? item.expiresAt.slice(0, 10) : "",
      pricePaid: "",
    });
    setFormOpen(true);
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          Track what you own — we subtract it from baskets and warn you before food expires.
        </p>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setScanOpen(true)}>
            <Camera aria-hidden /> Scan shelf
          </Button>
          <Button
            onClick={() => {
              setForm(EMPTY_FORM);
              setFormOpen(true);
            }}
          >
            <Plus aria-hidden /> Add item
          </Button>
        </div>
      </div>

      {expiring.length > 0 && (
        <div className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm dark:border-amber-900 dark:bg-amber-950/40">
          <AlarmClock className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" aria-hidden />
          <p className="text-amber-800 dark:text-amber-200">
            <span className="font-semibold">{expiring.length} item{expiring.length === 1 ? "" : "s"}</span> expiring
            within 5 days: {expiring.slice(0, 4).map((i) => i.name).join(", ")}
            {expiring.length > 4 ? "…" : ""}. Cook them first — check the Assistant for ideas.
          </p>
        </div>
      )}

      <Tabs defaultValue="PANTRY">
        <TabsList>
          {LOCATIONS.map(({ value, label, icon: Icon }) => {
            const count = (items ?? []).filter((i) => i.location === value).length;
            return (
              <TabsTrigger key={value} value={value} className="gap-1.5">
                <Icon className="h-4 w-4" aria-hidden />
                {label}
                {count > 0 && <span className="text-xs text-muted-foreground">({count})</span>}
              </TabsTrigger>
            );
          })}
          <TabsTrigger value="receipts" className="gap-1.5">
            <Receipt className="h-4 w-4" aria-hidden /> Receipts
          </TabsTrigger>
        </TabsList>

        {LOCATIONS.map(({ value, label }) => {
          const list = (items ?? []).filter((i) => i.location === value);
          return (
            <TabsContent key={value} value={value} className="mt-4">
              {isLoading ? (
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {Array.from({ length: 6 }).map((_, i) => (
                    <Skeleton key={i} className="h-28 rounded-xl" />
                  ))}
                </div>
              ) : list.length === 0 ? (
                <EmptyState
                  icon={UtensilsCrossed}
                  title={`Nothing in your ${label.toLowerCase()} yet`}
                  description="Add items manually, snap a photo of the shelf, or upload a receipt."
                  action={
                    <Button
                      onClick={() => {
                        setForm({ ...EMPTY_FORM, location: value });
                        setFormOpen(true);
                      }}
                    >
                      <Plus aria-hidden /> Add an item
                    </Button>
                  }
                />
              ) : (
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {list.map((item) => (
                    <Card key={item.id}>
                      <CardContent className="space-y-2.5 p-4">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <h3 className="truncate font-medium">{item.name}</h3>
                            <p className="text-sm text-muted-foreground">
                              {item.quantity} {item.unit}
                              {item.ingredient ? ` · ${item.ingredient.category.toLowerCase()}` : ""}
                            </p>
                          </div>
                          {expiryBadge(item)}
                        </div>
                        <div className="flex items-center justify-between">
                          <p className="text-xs text-muted-foreground">
                            {item.purchasedAt ? `Bought ${formatDate(item.purchasedAt)}` : ""}
                          </p>
                          <div className="flex gap-0.5">
                            <Button
                              size="icon"
                              variant="ghost"
                              aria-label={`Mark ${item.name} as used`}
                              title="Used it"
                              onClick={() => itemAction.mutate({ id: item.id, action: "consumed" })}
                            >
                              <Check className="h-4 w-4 text-emerald-600" />
                            </Button>
                            <Button
                              size="icon"
                              variant="ghost"
                              aria-label={`Mark ${item.name} as wasted`}
                              title="Had to throw away"
                              onClick={() => itemAction.mutate({ id: item.id, action: "wasted" })}
                            >
                              <Trash2 className="h-4 w-4 text-amber-600" />
                            </Button>
                            <Button
                              size="icon"
                              variant="ghost"
                              aria-label={`Edit ${item.name}`}
                              onClick={() => openEdit(item)}
                            >
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button
                              size="icon"
                              variant="ghost"
                              aria-label={`Delete ${item.name}`}
                              onClick={() => itemAction.mutate({ id: item.id, action: "delete" })}
                            >
                              <Trash2 className="h-4 w-4 text-muted-foreground" />
                            </Button>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </TabsContent>
          );
        })}

        <TabsContent value="receipts" className="mt-4 space-y-4">
          <label className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border border-dashed p-8 text-center transition-colors hover:bg-accent/50">
            <Upload className="h-6 w-6 text-muted-foreground" aria-hidden />
            <span className="text-sm font-medium">Upload a grocery receipt</span>
            <span className="text-xs text-muted-foreground">
              We extract the items and prices — and your upload improves price data for everyone.
            </span>
            <input
              type="file"
              accept="image/*"
              className="sr-only"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) uploadReceipt.mutate(f);
                e.target.value = "";
              }}
            />
          </label>
          {receipts.length === 0 ? (
            <EmptyState
              icon={Receipt}
              title="No receipts yet"
              description="Snap your supermarket receipts after shopping to auto-track spending."
            />
          ) : (
            <div className="space-y-2">
              {receipts.map((r) => (
                <div key={r.id} className="flex items-center justify-between rounded-lg border p-3 text-sm">
                  <div className="flex items-center gap-3">
                    <Receipt className="h-4 w-4 text-muted-foreground" aria-hidden />
                    <div>
                      <p className="font-medium">{r.storeCode ?? "Unknown store"}</p>
                      <p className="text-xs text-muted-foreground">{formatDate(r.createdAt)}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    {r.totalCents !== null && (
                      <span className="font-medium">S${(r.totalCents / 100).toFixed(2)}</span>
                    )}
                    <Badge
                      variant={
                        r.status === "COMPLETED" ? "success" : r.status === "FAILED" ? "destructive" : "secondary"
                      }
                      className="capitalize"
                    >
                      {r.status.toLowerCase()}
                    </Badge>
                  </div>
                </div>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* Add / edit dialog */}
      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{form.id ? "Edit item" : "Add pantry item"}</DialogTitle>
            <DialogDescription>
              {form.id ? "Update quantity, location or expiry." : "What did you buy or already own?"}
            </DialogDescription>
          </DialogHeader>
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              if (!form.name.trim()) {
                toast.error("Give the item a name");
                return;
              }
              saveItem.mutate(form);
            }}
          >
            <div className="space-y-2">
              <Label htmlFor="pantry-name">Name</Label>
              <Input
                id="pantry-name"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="e.g. Jasmine rice"
                autoFocus
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="pantry-qty">Quantity</Label>
                <Input
                  id="pantry-qty"
                  type="number"
                  min="0"
                  step="any"
                  value={form.quantity}
                  onChange={(e) => setForm({ ...form, quantity: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>Unit</Label>
                <Select value={form.unit} onValueChange={(v) => setForm({ ...form, unit: v })}>
                  <SelectTrigger aria-label="Unit">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {UNITS.map((u) => (
                      <SelectItem key={u} value={u}>
                        {u}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Location</Label>
                <Select
                  value={form.location}
                  onValueChange={(v) => setForm({ ...form, location: v as PantryLocation })}
                >
                  <SelectTrigger aria-label="Location">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {LOCATIONS.map((l) => (
                      <SelectItem key={l.value} value={l.value}>
                        {l.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="pantry-expiry">Expiry date</Label>
                <Input
                  id="pantry-expiry"
                  type="date"
                  value={form.expiresAt}
                  onChange={(e) => setForm({ ...form, expiresAt: e.target.value })}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="pantry-price">Price paid (S$, optional)</Label>
              <Input
                id="pantry-price"
                type="number"
                min="0"
                step="0.01"
                value={form.pricePaid}
                onChange={(e) => setForm({ ...form, pricePaid: e.target.value })}
                placeholder="e.g. 4.50"
              />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setFormOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={saveItem.isPending}>
                {saveItem.isPending ? "Saving…" : form.id ? "Save changes" : "Add item"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Scan dialog */}
      <ScanDialog open={scanOpen} onOpenChange={setScanOpen} onScan={(f, loc) => scan.mutate({ file: f, location: loc })} pending={scan.isPending} />
    </div>
  );
}

function ScanDialog({
  open,
  onOpenChange,
  onScan,
  pending,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onScan: (file: File, location: PantryLocation) => void;
  pending: boolean;
}) {
  const [location, setLocation] = React.useState<PantryLocation>("PANTRY");
  const [file, setFile] = React.useState<File | null>(null);
  const [preview, setPreview] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!file) {
      setPreview(null);
      return;
    }
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Scan your shelf</DialogTitle>
          <DialogDescription>
            Take a photo of your pantry, fridge or freezer — AI identifies the items for you.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Where was this taken?</Label>
            <Select value={location} onValueChange={(v) => setLocation(v as PantryLocation)}>
              <SelectTrigger aria-label="Scan location">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {LOCATIONS.map((l) => (
                  <SelectItem key={l.value} value={l.value}>
                    {l.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <label className="flex min-h-40 cursor-pointer flex-col items-center justify-center gap-2 overflow-hidden rounded-xl border border-dashed p-4 text-center transition-colors hover:bg-accent/50">
            {preview ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={preview} alt="Shelf preview" className="max-h-56 rounded-lg object-contain" />
            ) : (
              <>
                <Camera className="h-6 w-6 text-muted-foreground" aria-hidden />
                <span className="text-sm font-medium">Take or choose a photo</span>
                <span className="text-xs text-muted-foreground">JPEG/PNG, up to 15 MB</span>
              </>
            )}
            <input
              type="file"
              accept="image/*"
              capture="environment"
              className="sr-only"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            />
          </label>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button disabled={!file || pending} onClick={() => file && onScan(file, location)}>
            {pending ? "Identifying items…" : "Scan photo"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
