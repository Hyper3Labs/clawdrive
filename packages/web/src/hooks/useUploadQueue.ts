import { useRef, useCallback } from "react";
import { uploadFile } from "../api";
import { useToast } from "../components/shared/Toast";

const MAX_CONCURRENT = 3;

export function useUploadQueue(opts?: {
  potSlug?: string;
  onComplete?: () => void;
}) {
  const { show } = useToast();
  const activeRef = useRef(0);
  const queueRef = useRef<File[]>([]);
  const optsRef = useRef(opts);
  optsRef.current = opts;

  const processQueue = useCallback(async () => {
    while (queueRef.current.length > 0 && activeRef.current < MAX_CONCURRENT) {
      const file = queueRef.current.shift()!;
      activeRef.current++;
      try {
        const result = await uploadFile(file, { potSlug: optsRef.current?.potSlug });
        if (result.status === "duplicate") {
          show(`${file.name} already exists`, { type: "info" });
        } else {
          show(`${file.name} uploaded`, { type: "success" });
        }
      } catch (err) {
        show(`Failed to upload ${file.name}`, { type: "error" });
      } finally {
        activeRef.current--;
        processQueue();
      }
    }
    if (activeRef.current === 0 && queueRef.current.length === 0) {
      optsRef.current?.onComplete?.();
    }
  }, [show]);

  const enqueue = useCallback((files: File[]) => {
    queueRef.current.push(...files);
    if (files.length > 1) {
      show(`Uploading ${files.length} files...`, { type: "info" });
    }
    processQueue();
  }, [processQueue, show]);

  return { enqueue };
}
