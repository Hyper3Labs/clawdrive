import { createContext, useContext, useState, useCallback, useRef, type ReactNode } from "react";
import { Z_INDEX } from "../../theme";
import { cx, ui } from "./ui";

interface ToastAction {
  label: string;
  onClick: () => void;
}

interface ToastOptions {
  type?: "success" | "error" | "info";
  duration?: number;
  action?: ToastAction;
}

interface ToastItem {
  id: number;
  message: string;
  type: "success" | "error" | "info";
  action?: ToastAction;
}

interface ToastContextValue {
  show: (message: string, options?: ToastOptions) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used within ToastProvider");
  return ctx;
}

const MAX_TOASTS = 3;

const BORDER_COLORS: Record<string, string> = {
  success: "var(--accent-green)",
  error: "var(--accent-danger)",
  info: "var(--accent)",
};

// Removed inline style injection

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const nextId = useRef(0);

  const dismiss = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const show = useCallback((message: string, options?: ToastOptions) => {
    const id = nextId.current++;
    const type = options?.type ?? "info";
    const duration = options?.duration ?? (options?.action ? 8000 : 4000);
    const item: ToastItem = { id, message, type, action: options?.action };

    setToasts((prev) => {
      const next = [...prev, item];
      return next.length > MAX_TOASTS ? next.slice(-MAX_TOASTS) : next;
    });

    window.setTimeout(() => dismiss(id), duration);
  }, [dismiss]);

  return (
    <ToastContext.Provider value={{ show }}>
      {children}
      <div
        className="fixed bottom-5 right-5 flex flex-col gap-2 pointer-events-none"
        style={{ zIndex: Z_INDEX.toast }}
      >
        {toasts.map((t) => (
          <div
            key={t.id}
            style={{ borderColor: BORDER_COLORS[t.type] }}
            className={cx(
              ui.popover,
              "pointer-events-auto flex max-w-[360px] items-center gap-3 px-4 py-2.5 text-[13px] text-[var(--text)] animate-[toast-in_0.2s_ease-out]",
            )}
          >
            <span className="flex-1">{t.message}</span>
            {t.action && (
              <button
                onClick={() => { t.action!.onClick(); dismiss(t.id); }}
                className="bg-transparent border-none cursor-pointer text-[var(--accent)] font-semibold text-[13px] px-2 py-0.5 flex-shrink-0 hover:opacity-80 transition-opacity"
              >
                {t.action.label}
              </button>
            )}
            <button
              onClick={() => dismiss(t.id)}
              className="bg-transparent border-none cursor-pointer text-[var(--text-muted)] text-base p-0 leading-none flex-shrink-0 hover:text-white transition-colors"
            >
              ×
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
