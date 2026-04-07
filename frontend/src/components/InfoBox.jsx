export default function InfoBox({ type = "info", className = "", children }) {
  const styles = {
    primary: "bg-nfs-primary/10 border-nfs-primary/30 text-nfs-primary",
    info: "bg-blue-500/10 border-blue-500/30 text-blue-400",
    warning: "bg-amber-500/10 border-amber-500/30 text-amber-400",
    success: "bg-emerald-500/10 border-emerald-500/30 text-emerald-400",
  };
  return (
    <div
      className={`p-3 rounded-lg border text-sm ${styles[type]} ${className}`.trim()}
    >
      {children}
    </div>
  );
}
