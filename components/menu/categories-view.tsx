"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { ArrowDown, ArrowUp, FolderOpen, ImageOff, Pencil, Plus, Trash2 } from "lucide-react";

import {
  deleteCategoryAction,
  moveCategoryAction,
  saveCategoryAction,
} from "@/lib/actions/categories";
import { uploadMenuImageAction } from "@/lib/actions/upload";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";

export interface CategoryItem {
  id: string;
  name: string;
  imageUrl: string | null;
  isActive: boolean;
  productCount: number;
}

export function CategoriesView({ categories, canManage }: { categories: CategoryItem[]; canManage: boolean }) {
  const t = useTranslations("menu");
  const tc = useTranslations("common");
  const te = useTranslations("auth.errors");
  const router = useRouter();

  const [dialogOpen, setDialogOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<CategoryItem | null>(null);
  const [deleting, setDeleting] = React.useState<CategoryItem | null>(null);
  const [name, setName] = React.useState("");
  const [imageUrl, setImageUrl] = React.useState<string | null>(null);
  const [isActive, setIsActive] = React.useState(true);
  const [saving, setSaving] = React.useState(false);
  const [uploading, setUploading] = React.useState(false);

  function openCreate() {
    setEditing(null);
    setName("");
    setImageUrl(null);
    setIsActive(true);
    setDialogOpen(true);
  }

  function openEdit(category: CategoryItem) {
    setEditing(category);
    setName(category.name);
    setImageUrl(category.imageUrl);
    setIsActive(category.isActive);
    setDialogOpen(true);
  }

  async function onUpload(file: File) {
    setUploading(true);
    const fd = new FormData();
    fd.set("file", file);
    const result = await uploadMenuImageAction(fd);
    setUploading(false);
    if (result.ok && result.data) setImageUrl(result.data.url);
    else toast.error(t.has(`errors.${!result.ok ? result.error : ""}`) ? t(`errors.${!result.ok ? result.error : ""}`) : te("generic"));
  }

  async function onSave() {
    if (!name.trim()) return;
    setSaving(true);
    const result = await saveCategoryAction({
      id: editing?.id,
      name: name.trim(),
      imageUrl,
      isActive,
    });
    setSaving(false);
    if (result.ok) {
      toast.success(tc("success"));
      setDialogOpen(false);
      router.refresh();
    } else {
      toast.error(te.has(result.error) ? te(result.error) : te("generic"));
    }
  }

  async function onDelete() {
    if (!deleting) return;
    const result = await deleteCategoryAction(deleting.id);
    setDeleting(null);
    if (result.ok) {
      toast.success(tc("success"));
      router.refresh();
    } else if (result.error === "category_has_products") {
      toast.error(t("errors.category_has_products"));
    } else {
      toast.error(te.has(result.error) ? te(result.error) : te("generic"));
    }
  }

  async function onMove(id: string, direction: "up" | "down") {
    const result = await moveCategoryAction(id, direction);
    if (result.ok) router.refresh();
  }

  return (
    <div>
      {canManage && (
        <div className="mb-4">
          <Button onClick={openCreate}>
            <Plus />
            {t("newCategory")}
          </Button>
        </div>
      )}

      {categories.length === 0 && (
        <Card className="flex flex-col items-center justify-center gap-2 p-12 text-muted-foreground">
          <FolderOpen className="h-8 w-8 opacity-40" />
          {tc("noData")}
        </Card>
      )}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {categories.map((category, index) => (
          <Card key={category.id} className="flex items-center gap-3 p-3">
            {category.imageUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={category.imageUrl} alt="" className="h-14 w-14 rounded-lg border object-cover" />
            ) : (
              <div className="flex h-14 w-14 items-center justify-center rounded-lg border bg-muted text-muted-foreground">
                <ImageOff className="h-5 w-5" />
              </div>
            )}
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="truncate font-medium">{category.name}</span>
                {!category.isActive && <Badge variant="secondary">{t("inactive")}</Badge>}
              </div>
              <div className="text-xs text-muted-foreground">
                {t("productCount", { count: category.productCount })}
              </div>
            </div>
            {canManage && (
              <div className="flex shrink-0 items-center gap-0.5">
                <Button variant="ghost" size="iconSm" disabled={index === 0} onClick={() => onMove(category.id, "up")}>
                  <ArrowUp />
                </Button>
                <Button
                  variant="ghost"
                  size="iconSm"
                  disabled={index === categories.length - 1}
                  onClick={() => onMove(category.id, "down")}
                >
                  <ArrowDown />
                </Button>
                <Button variant="ghost" size="iconSm" onClick={() => openEdit(category)}>
                  <Pencil />
                </Button>
                <Button
                  variant="ghost"
                  size="iconSm"
                  className="text-destructive hover:text-destructive"
                  onClick={() => setDeleting(category)}
                >
                  <Trash2 />
                </Button>
              </div>
            )}
          </Card>
        ))}
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? t("editCategory") : t("newCategory")}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4">
            <div className="grid gap-2">
              <Label htmlFor="category-name">{t("fields.name")}</Label>
              <Input id="category-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={60} />
            </div>
            <div className="grid gap-2">
              <Label>{t("fields.image")}</Label>
              <div className="flex items-center gap-3">
                {imageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={imageUrl} alt="" className="h-14 w-14 rounded-lg border object-cover" />
                ) : (
                  <div className="flex h-14 w-14 items-center justify-center rounded-lg border bg-muted text-muted-foreground">
                    <ImageOff className="h-5 w-5" />
                  </div>
                )}
                <Input
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  disabled={uploading}
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) void onUpload(file);
                  }}
                  className="max-w-60"
                />
                {imageUrl && (
                  <Button variant="ghost" size="sm" onClick={() => setImageUrl(null)}>
                    {tc("delete")}
                  </Button>
                )}
              </div>
            </div>
            <div className="flex items-center justify-between rounded-lg border p-3">
              <Label htmlFor="category-active">{t("fields.active")}</Label>
              <Switch id="category-active" checked={isActive} onCheckedChange={setIsActive} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              {tc("cancel")}
            </Button>
            <Button onClick={onSave} loading={saving || uploading} disabled={!name.trim()}>
              {tc("save")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={Boolean(deleting)} onOpenChange={(open) => !open && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("deleteCategory")}</AlertDialogTitle>
            <AlertDialogDescription>
              {deleting && deleting.productCount > 0
                ? t("errors.category_has_products")
                : t("deleteCategoryConfirm", { name: deleting?.name ?? "" })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{tc("cancel")}</AlertDialogCancel>
            <AlertDialogAction destructive onClick={onDelete} disabled={(deleting?.productCount ?? 0) > 0}>
              {tc("delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
