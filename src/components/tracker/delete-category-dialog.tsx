"use client";

import { useState } from "react";
import { useTRPC } from "@/trpc/client";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogHeader, DialogTitle, DialogBody, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { toast } from "sonner";
import { t, type Language } from "@/lib/translations";

interface DeleteCategoryDialogProps {
  category: {
    id: string;
    name: string;
    icon: string | null;
    transactionCount: number;
  } | null;
  open: boolean;
  onClose: () => void;
  categories: Array<{ id: string; name: string; icon: string | null; parentName: string | null }>;
  funds: Array<{ id: string; name: string; icon: string | null }>;
  lang: Language;
}

export function DeleteCategoryDialog({ category, open, onClose, categories, funds, lang }: DeleteCategoryDialogProps) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const [reassignChoice, setReassignChoice] = useState<"uncategorized" | "moveTo">("uncategorized");
  const [targetId, setTargetId] = useState<string>("");

  const deleteMutation = useMutation(
    trpc.category.delete.mutationOptions({
      onSuccess: () => {
        queryClient.invalidateQueries();
        const count = category?.transactionCount ?? 0;
        toast.success(
          `${t(lang, "tracker.categoryDeleted")}${count > 0 ? ` ${count} ${t(lang, "tracker.reassigned")}` : ""}`
        );
        handleClose();
      },
      onError: (err) => {
        toast.error(err.message);
      },
    })
  );

  const handleClose = () => {
    setReassignChoice("uncategorized");
    setTargetId("");
    deleteMutation.reset();
    onClose();
  };

  const handleConfirm = () => {
    if (!category) return;
    if (reassignChoice === "uncategorized") {
      deleteMutation.mutate({ id: category.id, reassignTo: "uncategorized" });
    } else if (targetId.startsWith("cat_")) {
      deleteMutation.mutate({
        id: category.id,
        reassignTo: "category",
        targetCategoryId: targetId.replace("cat_", ""),
      });
    } else if (targetId.startsWith("fund_")) {
      deleteMutation.mutate({
        id: category.id,
        reassignTo: "fund",
        targetFundId: targetId.replace("fund_", ""),
      });
    }
  };

  const canConfirm =
    reassignChoice === "uncategorized" || (reassignChoice === "moveTo" && !!targetId);

  // Group categories by parent for the dropdown
  const grouped = categories.reduce<Record<string, typeof categories>>((acc, cat) => {
    const group = cat.parentName ?? t(lang, "common.other");
    if (!acc[group]) acc[group] = [];
    acc[group].push(cat);
    return acc;
  }, {});

  if (!category) return null;

  return (
    <Dialog open={open} onClose={handleClose}>
      <DialogHeader onClose={handleClose}>
        <DialogTitle>
          {t(lang, "tracker.deleteCategoryTitle")}
        </DialogTitle>
      </DialogHeader>
      <DialogBody>
        <p className="text-sm text-muted-foreground mb-4">
          {category.icon && <span className="mr-1">{category.icon}</span>}
          <strong>{category.name}</strong>
          {" — "}{category.transactionCount} {t(lang, "tracker.hasTransactions")}
          <br />
          {t(lang, "tracker.whatShouldHappen")}
        </p>

        <div className="space-y-3">
          {/* Option 1: Uncategorized */}
          <label className="flex items-start gap-3 p-3 rounded-lg border cursor-pointer hover:bg-muted/50 transition-colors has-[:checked]:border-primary has-[:checked]:bg-primary/5">
            <input
              type="radio"
              name="reassign"
              value="uncategorized"
              checked={reassignChoice === "uncategorized"}
              onChange={() => { setReassignChoice("uncategorized"); setTargetId(""); }}
              className="mt-0.5"
            />
            <div>
              <div className="text-sm font-medium">{t(lang, "tracker.leaveUncategorized")}</div>
              <div className="text-xs text-muted-foreground">{t(lang, "tracker.leaveUncategorizedDesc")}</div>
            </div>
          </label>

          {/* Option 2: Move to category or fund */}
          <label className="flex items-start gap-3 p-3 rounded-lg border cursor-pointer hover:bg-muted/50 transition-colors has-[:checked]:border-primary has-[:checked]:bg-primary/5">
            <input
              type="radio"
              name="reassign"
              value="moveTo"
              checked={reassignChoice === "moveTo"}
              onChange={() => setReassignChoice("moveTo")}
              className="mt-0.5"
            />
            <div className="flex-1">
              <div className="text-sm font-medium">{t(lang, "tracker.moveToCategory")}</div>
              {reassignChoice === "moveTo" && (
                <Select
                  className="mt-2"
                  value={targetId}
                  onChange={(e) => setTargetId(e.target.value)}
                  onClick={(e) => e.stopPropagation()}
                >
                  <option value="">{t(lang, "tracker.selectCategory")}</option>
                  {Object.entries(grouped).map(([groupName, cats]) => (
                    <optgroup key={groupName} label={groupName}>
                      {cats.map((c) => (
                        <option key={c.id} value={`cat_${c.id}`}>
                          {c.icon ? `${c.icon} ` : ""}{c.name}
                        </option>
                      ))}
                    </optgroup>
                  ))}
                  {funds.length > 0 && (
                    <optgroup label={t(lang, "tracker.funds")}>
                      {funds.map((f) => (
                        <option key={f.id} value={`fund_${f.id}`}>
                          {f.icon ?? "💰"} {f.name}
                        </option>
                      ))}
                    </optgroup>
                  )}
                </Select>
              )}
            </div>
          </label>
        </div>
      </DialogBody>
      <DialogFooter>
        <Button variant="outline" onClick={handleClose}>
          {t(lang, "common.cancel")}
        </Button>
        <Button
          variant="destructive"
          onClick={handleConfirm}
          disabled={!canConfirm || deleteMutation.isPending}
        >
          {deleteMutation.isPending ? t(lang, "common.deleting") : `${t(lang, "tracker.deleteConfirm")} ${category.name}`}
        </Button>
      </DialogFooter>
    </Dialog>
  );
}
