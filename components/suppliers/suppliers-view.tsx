"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Banknote, Pencil, Plus, Trash2, Truck } from "lucide-react";

import { deleteSupplierAction, paySupplierAction, saveSupplierAction } from "@/lib/actions/suppliers";
import { formatMoney } from "@/lib/money";
import type { Locale } from "@/lib/locale";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { MoneyInput } from "@/components/ui/money-input";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";

export interface SupplierRow {
  id: string;
  name: string;
  contactName: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  notes: string | null;
  isActive: boolean;
  poCount: number;
  purchasedCentimes: number;
  paidCentimes: number;
  balanceCentimes: number;
}

export function SuppliersView({
  suppliers,
  locale,
  permissions,
}: {
  suppliers: SupplierRow[];
  locale: Locale;
  permissions: { manage: boolean; pay: boolean };
}) {
  const t = useTranslations("suppliers");
  const tc = useTranslations("common");
  const te = useTranslations("auth.errors");
  const router = useRouter();

  const [dialogOpen, setDialogOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<SupplierRow | null>(null);
  const [name, setName] = React.useState("");
  const [contact, setContact] = React.useState("");
  const [phone, setPhone] = React.useState("");
  const [email, setEmail] = React.useState("");
  const [address, setAddress] = React.useState("");
  const [notes, setNotes] = React.useState("");
  const [isActive, setIsActive] = React.useState(true);

  const [payFor, setPayFor] = React.useState<SupplierRow | null>(null);
  const [payAmount, setPayAmount] = React.useState("");
  const [payMethod, setPayMethod] = React.useState("cash");
  const [payNotes, setPayNotes] = React.useState("");

  const [pending, setPending] = React.useState(false);

  function errToast(code: string) {
    toast.error(te.has(code) ? te(code) : te("generic"));
  }

  function openCreate() {
    setEditing(null);
    setName("");
    setContact("");
    setPhone("");
    setEmail("");
    setAddress("");
    setNotes("");
    setIsActive(true);
    setDialogOpen(true);
  }

  function openEdit(row: SupplierRow) {
    setEditing(row);
    setName(row.name);
    setContact(row.contactName ?? "");
    setPhone(row.phone ?? "");
    setEmail(row.email ?? "");
    setAddress(row.address ?? "");
    setNotes(row.notes ?? "");
    setIsActive(row.isActive);
    setDialogOpen(true);
  }

  async function onSave() {
    setPending(true);
    const result = await saveSupplierAction({
      id: editing?.id,
      name: name.trim(),
      contactName: contact.trim() || null,
      phone: phone.trim() || null,
      email: email.trim() || null,
      address: address.trim() || null,
      notes: notes.trim() || null,
      isActive,
    });
    setPending(false);
    if (!result.ok) return errToast(result.error);
    toast.success(tc("success"));
    setDialogOpen(false);
    router.refresh();
  }

  async function onDelete(row: SupplierRow) {
    const result = await deleteSupplierAction(row.id);
    if (!result.ok) return errToast(result.error);
    toast.success(result.data?.deactivated ? t("deactivatedInstead") : tc("success"));
    router.refresh();
  }

  async function onPay() {
    if (!payFor) return;
    setPending(true);
    const result = await paySupplierAction({
      supplierId: payFor.id,
      amount: payAmount,
      method: payMethod,
      notes: payNotes.trim() || null,
    });
    setPending(false);
    if (!result.ok) return errToast(result.error);
    toast.success(tc("success"));
    setPayFor(null);
    router.refresh();
  }

  return (
    <div>
      {permissions.manage && (
        <div className="mb-4">
          <Button onClick={openCreate}>
            <Plus />
            {t("newSupplier")}
          </Button>
        </div>
      )}

      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("table.name")}</TableHead>
              <TableHead className="hidden md:table-cell">{t("table.contact")}</TableHead>
              <TableHead className="hidden text-end sm:table-cell">{t("table.purchased")}</TableHead>
              <TableHead className="hidden text-end sm:table-cell">{t("table.paid")}</TableHead>
              <TableHead className="text-end">{t("table.balance")}</TableHead>
              {(permissions.manage || permissions.pay) && <TableHead className="w-28 text-end">{tc("actions")}</TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {suppliers.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} className="py-12 text-center text-muted-foreground">
                  <Truck className="mx-auto mb-2 h-8 w-8 opacity-40" />
                  {tc("noData")}
                </TableCell>
              </TableRow>
            )}
            {suppliers.map((row) => (
              <TableRow key={row.id} className={!row.isActive ? "opacity-50" : undefined}>
                <TableCell>
                  <span className="font-medium">{row.name}</span>
                  {!row.isActive && (
                    <Badge variant="secondary" className="ms-2">
                      {t("inactive")}
                    </Badge>
                  )}
                  <div className="text-xs text-muted-foreground" dir="ltr">
                    {row.phone ?? ""}
                  </div>
                </TableCell>
                <TableCell className="hidden text-muted-foreground md:table-cell">{row.contactName ?? "—"}</TableCell>
                <TableCell className="hidden text-end text-muted-foreground tabular sm:table-cell">
                  {formatMoney(row.purchasedCentimes, locale)}
                </TableCell>
                <TableCell className="hidden text-end text-muted-foreground tabular sm:table-cell">
                  {formatMoney(row.paidCentimes, locale)}
                </TableCell>
                <TableCell
                  className={`text-end font-semibold tabular ${row.balanceCentimes > 0 ? "text-warning-foreground" : "text-success"}`}
                >
                  {formatMoney(row.balanceCentimes, locale)}
                </TableCell>
                {(permissions.manage || permissions.pay) && (
                  <TableCell className="text-end">
                    <div className="flex justify-end gap-0.5">
                      {permissions.pay && (
                        <Button
                          variant="ghost"
                          size="iconSm"
                          title={t("pay")}
                          onClick={() => {
                            setPayFor(row);
                            setPayAmount(row.balanceCentimes > 0 ? String(row.balanceCentimes / 100) : "");
                            setPayMethod("cash");
                            setPayNotes("");
                          }}
                        >
                          <Banknote />
                        </Button>
                      )}
                      {permissions.manage && (
                        <>
                          <Button variant="ghost" size="iconSm" onClick={() => openEdit(row)}>
                            <Pencil />
                          </Button>
                          <Button
                            variant="ghost"
                            size="iconSm"
                            className="text-destructive hover:text-destructive"
                            onClick={() => onDelete(row)}
                          >
                            <Trash2 />
                          </Button>
                        </>
                      )}
                    </div>
                  </TableCell>
                )}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>

      {/* CRUD dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? t("editSupplier") : t("newSupplier")}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3">
            <div className="grid gap-1.5">
              <Label>{t("fields.name")}</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} maxLength={100} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-1.5">
                <Label>{t("fields.contact")}</Label>
                <Input value={contact} onChange={(e) => setContact(e.target.value)} maxLength={80} />
              </div>
              <div className="grid gap-1.5">
                <Label>{t("fields.phone")}</Label>
                <Input dir="ltr" value={phone} onChange={(e) => setPhone(e.target.value)} maxLength={30} />
              </div>
            </div>
            <div className="grid gap-1.5">
              <Label>{t("fields.email")}</Label>
              <Input type="email" dir="ltr" value={email} onChange={(e) => setEmail(e.target.value)} maxLength={120} />
            </div>
            <div className="grid gap-1.5">
              <Label>{t("fields.address")}</Label>
              <Textarea rows={2} value={address} onChange={(e) => setAddress(e.target.value)} maxLength={300} />
            </div>
            <div className="grid gap-1.5">
              <Label>{t("fields.notes")}</Label>
              <Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={500} />
            </div>
            <div className="flex items-center justify-between rounded-lg border p-3">
              <Label htmlFor="sup-active">{t("fields.active")}</Label>
              <Switch id="sup-active" checked={isActive} onCheckedChange={setIsActive} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              {tc("cancel")}
            </Button>
            <Button onClick={onSave} loading={pending} disabled={!name.trim()}>
              {tc("save")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Payment dialog */}
      <Dialog open={Boolean(payFor)} onOpenChange={(open) => !open && setPayFor(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{t("payTitle", { name: payFor?.name ?? "" })}</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            {t("table.balance")}:{" "}
            <span className="font-semibold tabular">{formatMoney(payFor?.balanceCentimes ?? 0, locale)}</span>
          </p>
          <div className="grid gap-3">
            <div className="grid gap-1.5">
              <Label>{t("payAmount")}</Label>
              <MoneyInput value={payAmount} onChange={setPayAmount} />
            </div>
            <div className="grid gap-1.5">
              <Label>{t("payMethod")}</Label>
              <Input value={payMethod} onChange={(e) => setPayMethod(e.target.value)} maxLength={40} />
            </div>
            <div className="grid gap-1.5">
              <Label>
                {t("fields.notes")} <span className="text-xs text-muted-foreground">({tc("optional")})</span>
              </Label>
              <Textarea rows={2} value={payNotes} onChange={(e) => setPayNotes(e.target.value)} maxLength={300} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPayFor(null)}>
              {tc("cancel")}
            </Button>
            <Button onClick={onPay} loading={pending} disabled={!payAmount.trim() || !payMethod.trim()}>
              {t("pay")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
