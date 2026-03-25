import { createContext, useContext, useState, useCallback, useRef, type ReactNode } from "react";
import { MAP_THEME } from "../../theme";

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
  success: MAP_THEME.accentSecondary,
  error: "#ff8d8d",
  info: MAP_THEME.accentPrimary,
};

// Inject keyframe animation once
if (typeof document !== "undefined" && !document.getElementById("toast-keyframes")) {
  const style = document.createElement("style");
  style.id = "toast-keyframes";
  style.textContent = `@keyframes toast-in { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }`;
  document.head.appendChild(style);
}

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
      <div style={{
        position: "fixed", bottom: 20, right: 20, zIndex: 9999,
        display: "flex", flexDirection: "column", gap: 8, pointerEvents: "none",
      }}>
        {toasts.map((t) => (
          <div
            key={t.id}
            style={{
              background: MAP_THEME.panel,
              border: `1px solid ${BORDER_COLORS[t.type]}`,
              borderRadius: 8,
              padding: "10px 16px",
              fontSize: 13,
              color: MAP_THEME.text,
              display: "flex",
              alignItems: "center",
              gap: 12,
              pointerEvents: "auto",
              boxShadow: "0 4px 20px rgba(0,0,0,0.4)",
              animation: "toast-in 0.2s ease-out",
              maxWidth: 360,
            }}
          >
            <span style={{ flex: 1 }}>{t.message}</span>
            {t.action && (
              <button
                onClick={() => { t.action!.onClick(); dismiss(t.id); }}
                style={{
                  background: "none", border: "none", cursor: "pointer",
                  color: MAP_THEME.accentPrimary, fontWeight: 600,
                  fontSize: 13, padding: "2px 8px", flexShrink: 0,
                }}
              >
                {t.action.label}
              </button>
            )}
            <button
              onClick={() => dismiss(t.id)}
              style={{
                background: "none", border: "none", cursor: "pointer",
                color: MAP_THEME.textMuted, fontSize: 16, padding: 0,
                lineHeight: 1, flexShrink: 0,
              }}
            >
              ×
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
