"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  Camera,
  ClipboardPaste,
  FileUp,
  Link2,
  Loader2,
  PencilLine,
  UploadCloud,
  X,
} from "lucide-react";
import { toast } from "sonner";
import {
  importUrlSchema,
  pasteRecipeSchema,
  type ManualRecipeInput,
  type RecipeDto,
} from "@smart-grocery/shared";
import { z } from "zod";

import { RecipeForm } from "@/components/recipe-form";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { api } from "@/lib/api";
import { handleApiError } from "@/lib/errors";
import { cn } from "@/lib/utils";

type UrlInput = z.infer<typeof importUrlSchema>;
type PasteInput = z.infer<typeof pasteRecipeSchema>;

const ACCEPTED = ["image/jpeg", "image/png", "image/webp", "image/heic", "application/pdf"];

function UploadTab() {
  const router = useRouter();
  const [file, setFile] = React.useState<File | null>(null);
  const [preview, setPreview] = React.useState<string | null>(null);
  const [dragging, setDragging] = React.useState(false);
  const [progress, setProgress] = React.useState(0);
  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const cameraInputRef = React.useRef<HTMLInputElement>(null);

  const pick = (f: File | undefined | null) => {
    if (!f) return;
    if (!ACCEPTED.includes(f.type) && !f.type.startsWith("image/")) {
      toast.error("Please choose an image or PDF file.");
      return;
    }
    setFile(f);
    if (preview) URL.revokeObjectURL(preview);
    setPreview(f.type.startsWith("image/") ? URL.createObjectURL(f) : null);
  };

  const upload = useMutation({
    mutationFn: async (f: File) => {
      // Simulated progress while the request is in flight (fetch lacks upload events)
      setProgress(8);
      const ticker = setInterval(
        () => setProgress((p) => (p < 90 ? p + Math.random() * 12 : p)),
        350,
      );
      try {
        const formData = new FormData();
        formData.append("file", f);
        return await api<RecipeDto>("/recipes/upload", { method: "POST", formData });
      } finally {
        clearInterval(ticker);
        setProgress(100);
      }
    },
    onSuccess: (recipe) => {
      toast.success("Recipe uploaded — extracting ingredients…");
      router.push(`/recipes/${recipe.id}`);
    },
    onError: (e) => {
      setProgress(0);
      handleApiError(e, "Upload failed");
    },
  });

  return (
    <Card>
      <CardContent className="space-y-4 p-6">
        <div
          role="button"
          tabIndex={0}
          aria-label="Upload recipe photo or PDF"
          onClick={() => fileInputRef.current?.click()}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") fileInputRef.current?.click();
          }}
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            pick(e.dataTransfer.files?.[0]);
          }}
          className={cn(
            "flex cursor-pointer flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed px-6 py-12 text-center transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
            dragging ? "border-primary bg-primary/5" : "border-input hover:border-primary/50",
          )}
        >
          <UploadCloud className="h-10 w-10 text-muted-foreground" aria-hidden />
          <div>
            <p className="font-medium">Drag &amp; drop a recipe photo or PDF</p>
            <p className="text-sm text-muted-foreground">
              or click to browse — JPG, PNG, WEBP, HEIC, PDF
            </p>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={(e) => {
              e.stopPropagation();
              cameraInputRef.current?.click();
            }}
          >
            <Camera aria-hidden /> Take a photo
          </Button>
        </div>

        <input
          ref={fileInputRef}
          type="file"
          accept="image/*,application/pdf"
          className="hidden"
          onChange={(e) => pick(e.target.files?.[0])}
          aria-hidden
          tabIndex={-1}
        />
        <input
          ref={cameraInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={(e) => pick(e.target.files?.[0])}
          aria-hidden
          tabIndex={-1}
        />

        {file && (
          <div className="flex items-center gap-3 rounded-lg border p-3">
            {preview ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={preview}
                alt="Selected recipe preview"
                className="h-16 w-16 rounded-md object-cover"
              />
            ) : (
              <div className="flex h-16 w-16 items-center justify-center rounded-md bg-muted">
                <FileUp className="h-6 w-6 text-muted-foreground" aria-hidden />
              </div>
            )}
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{file.name}</p>
              <p className="text-xs text-muted-foreground">
                {(file.size / 1024 / 1024).toFixed(1)} MB
              </p>
              {upload.isPending && <Progress value={progress} className="mt-2" />}
            </div>
            {!upload.isPending && (
              <Button
                variant="ghost"
                size="icon"
                onClick={() => {
                  setFile(null);
                  if (preview) URL.revokeObjectURL(preview);
                  setPreview(null);
                }}
                aria-label="Remove selected file"
              >
                <X className="h-4 w-4" />
              </Button>
            )}
          </div>
        )}

        <Button
          className="w-full sm:w-auto"
          disabled={!file || upload.isPending}
          onClick={() => file && upload.mutate(file)}
        >
          {upload.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
          Upload &amp; extract
        </Button>
      </CardContent>
    </Card>
  );
}

function ImportUrlTab() {
  const router = useRouter();
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<UrlInput>({ resolver: zodResolver(importUrlSchema) });

  const importUrl = useMutation({
    mutationFn: (body: UrlInput) =>
      api<RecipeDto>("/recipes/import-url", { method: "POST", body }),
    onSuccess: (recipe) => {
      toast.success("Importing recipe from URL…");
      router.push(`/recipes/${recipe.id}`);
    },
    onError: (e) => handleApiError(e, "Could not import that URL"),
  });

  return (
    <Card>
      <CardContent className="p-6">
        <form
          onSubmit={handleSubmit((v) => importUrl.mutate(v))}
          className="space-y-4"
          noValidate
        >
          <div className="space-y-1.5">
            <Label htmlFor="recipe-url">Recipe URL</Label>
            <Input
              id="recipe-url"
              type="url"
              placeholder="https://www.example.com/hainanese-chicken-rice"
              {...register("url")}
            />
            {errors.url && <p className="text-xs text-destructive">{errors.url.message}</p>}
            <p className="text-xs text-muted-foreground">
              Works with most recipe blogs and cooking sites.
            </p>
          </div>
          <Button type="submit" disabled={importUrl.isPending}>
            {importUrl.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
            Import recipe
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

function PasteTab() {
  const router = useRouter();
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<PasteInput>({ resolver: zodResolver(pasteRecipeSchema) });

  const paste = useMutation({
    mutationFn: (body: PasteInput) => api<RecipeDto>("/recipes/paste", { method: "POST", body }),
    onSuccess: (recipe) => {
      toast.success("Parsing pasted recipe…");
      router.push(`/recipes/${recipe.id}`);
    },
    onError: (e) => handleApiError(e, "Could not parse that text"),
  });

  return (
    <Card>
      <CardContent className="p-6">
        <form onSubmit={handleSubmit((v) => paste.mutate(v))} className="space-y-4" noValidate>
          <div className="space-y-1.5">
            <Label htmlFor="recipe-text">Recipe text</Label>
            <Textarea
              id="recipe-text"
              rows={10}
              placeholder={
                "Paste the full recipe here — title, ingredients and steps.\n\ne.g.\nGarlic Butter Prawns\n500g prawns\n4 cloves garlic\n..."
              }
              {...register("text")}
            />
            {errors.text && <p className="text-xs text-destructive">{errors.text.message}</p>}
          </div>
          <Button type="submit" disabled={paste.isPending}>
            {paste.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
            Parse recipe
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

function ManualTab() {
  const router = useRouter();

  const create = useMutation({
    mutationFn: (body: ManualRecipeInput) => api<RecipeDto>("/recipes", { method: "POST", body }),
    onSuccess: (recipe) => {
      toast.success("Recipe created");
      router.push(`/recipes/${recipe.id}`);
    },
    onError: (e) => handleApiError(e, "Could not create recipe"),
  });

  return (
    <Card>
      <CardContent className="p-6">
        <RecipeForm
          onSubmit={(values) => create.mutate(values)}
          submitting={create.isPending}
          submitLabel="Create recipe"
        />
      </CardContent>
    </Card>
  );
}

export default function NewRecipePage() {
  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">Add a recipe</h2>
        <p className="text-sm text-muted-foreground">
          Scan, import or type it in — we&apos;ll extract ingredients and price them across 7
          stores.
        </p>
      </div>

      <Tabs defaultValue="upload">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="upload">
            <Camera aria-hidden /> <span className="hidden sm:inline">Upload</span>
          </TabsTrigger>
          <TabsTrigger value="url">
            <Link2 aria-hidden /> <span className="hidden sm:inline">URL</span>
          </TabsTrigger>
          <TabsTrigger value="paste">
            <ClipboardPaste aria-hidden /> <span className="hidden sm:inline">Paste</span>
          </TabsTrigger>
          <TabsTrigger value="manual">
            <PencilLine aria-hidden /> <span className="hidden sm:inline">Manual</span>
          </TabsTrigger>
        </TabsList>
        <TabsContent value="upload">
          <UploadTab />
        </TabsContent>
        <TabsContent value="url">
          <ImportUrlTab />
        </TabsContent>
        <TabsContent value="paste">
          <PasteTab />
        </TabsContent>
        <TabsContent value="manual">
          <ManualTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}
