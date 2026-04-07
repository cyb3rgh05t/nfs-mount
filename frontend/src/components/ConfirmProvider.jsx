import {
  createContext,
  useCallback,
  useContext,
  useRef,
  useState,
} from "react";
import { AlertTriangle, Trash2, Info } from "lucide-react";

const ConfirmContext = createContext();

const PRESETS = {
  danger: {
    icon: Trash2,
    iconBg: "bg-red-500/20",
    iconColor: "text-red-400",
    confirmBtn: "bg-red-600 hover:bg-red-700",
    confirmText: "Delete",
  },
  warning: {
    icon: AlertTriangle,
    iconBg: "bg-yellow-500/20",
    iconColor: "text-yellow-400",
    confirmBtn: "bg-yellow-600 hover:bg-yellow-700",
    confirmText: "Confirm",
  },
  info: {
    icon: Info,
    iconBg: "bg-blue-500/20",
    iconColor: "text-blue-400",
    confirmBtn: "bg-blue-600 hover:bg-blue-700",
    confirmText: "Confirm",
  },
};

export function ConfirmProvider({ children }) {
  const [dialog, setDialog] = useState(null);
  const resolveRef = useRef(null);

  const confirm = useCallback(
    ({
      title = "Are you sure?",
      message = "",
      variant = "danger",
      confirmText,
      cancelText = "Cancel",
    } = {}) => {
      return new Promise((resolve) => {
        resolveRef.current = resolve;
        setDialog({ title, message, variant, confirmText, cancelText });
      });
    },
    [],
  );

  const handleClose = (result) => {
    resolveRef.current?.(result);
    resolveRef.current = null;
    setDialog(null);
  };

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      {dialog && <ConfirmDialog {...dialog} onClose={handleClose} />}
    </ConfirmContext.Provider>
  );
}

function ConfirmDialog({
  title,
  message,
  variant,
  confirmText,
  cancelText,
  onClose,
}) {
  const preset = PRESETS[variant] || PRESETS.info;
  const Icon = preset.icon;
  const btnText = confirmText || preset.confirmText;

  return (
    <div className="fixed inset-0 z-[9998] flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={() => onClose(false)}
      />
      {/* Dialog */}
      <div className="relative bg-nfs-card border border-nfs-border rounded-xl shadow-2xl w-full max-w-md mx-4 p-6 animate-scale-in">
        <div className="flex items-start gap-4">
          <div className={`p-3 rounded-full ${preset.iconBg}`}>
            <Icon className={`w-6 h-6 ${preset.iconColor}`} />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="text-lg font-semibold text-white">{title}</h3>
            {message && <p className="mt-2 text-sm text-gray-400">{message}</p>}
          </div>
        </div>
        <div className="flex justify-end gap-3 mt-6">
          <button
            onClick={() => onClose(false)}
            className="px-4 py-2 text-sm rounded-lg bg-nfs-card border border-nfs-border hover:border-nfs-primary text-white font-medium transition-all"
          >
            {cancelText}
          </button>
          <button
            onClick={() => onClose(true)}
            className="px-4 py-2 text-sm rounded-lg bg-nfs-card border border-nfs-border hover:border-nfs-primary text-white font-medium transition-all"
          >
            {btnText}
          </button>
        </div>
      </div>
    </div>
  );
}

export function useConfirm() {
  const ctx = useContext(ConfirmContext);
  if (!ctx) throw new Error("useConfirm must be inside ConfirmProvider");
  return ctx;
}
