export function Logo({ className = "h-8 w-auto" }: { className?: string }) {
  return (
    <div className={`flex items-center gap-2 ${className ? "" : ""}`}>
      <svg viewBox="0 0 32 32" className="h-8 w-8" aria-label="Naturo Pro logo">
        <circle cx="16" cy="16" r="15" fill="#186749" />
        <path d="M16 7c-4 5-4 10 0 14 4-4 4-9 0-14z" fill="#17EC9B" />
        <path d="M16 7v18" stroke="#FAF8F4" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
      <span className="font-extrabold tracking-tight text-lg" style={{ color: "#186749" }}>
        Naturo<span style={{ color: "#17EC9B" }}>Pro</span>
      </span>
    </div>
  );
}
