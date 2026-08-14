import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { transactionsApi } from "../api/transactionsApi";

/**
 * Attachments of one movement. Listing works even with no bucket configured
 * (it just comes back empty), so the section can always be painted; only the
 * upload/open/delete calls can answer `503 ATTACHMENTS_UNAVAILABLE`.
 */
export function useAttachments(transactionId: string | undefined) {
  const qc = useQueryClient();
  const key = ["transactions", transactionId, "attachments"];
  const invalidate = () => void qc.invalidateQueries({ queryKey: key });

  const list = useQuery({
    queryKey: key,
    queryFn: () => transactionsApi.attachments.list(transactionId!),
    enabled: Boolean(transactionId),
  });

  const upload = useMutation({
    mutationFn: (file: File) => transactionsApi.attachments.upload(transactionId!, file),
    onSuccess: invalidate,
  });

  const remove = useMutation({
    mutationFn: (attachmentId: string) =>
      transactionsApi.attachments.remove(transactionId!, attachmentId),
    onSuccess: invalidate,
  });

  /** Signs a short-lived URL and hands it back for the browser to open. */
  const open = async (attachmentId: string): Promise<string> => {
    const { url } = await transactionsApi.attachments.url(transactionId!, attachmentId);
    return url;
  };

  return { list, upload, remove, open };
}
