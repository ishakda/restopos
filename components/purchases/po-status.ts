export const PO_STATUS_BADGE: Record<string, "secondary" | "info" | "warning" | "success" | "destructive"> = {
  draft: "secondary",
  ordered: "info",
  partially_received: "warning",
  received: "success",
  cancelled: "destructive",
};
