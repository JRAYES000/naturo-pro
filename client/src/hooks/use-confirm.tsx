import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";

export type ConfirmOptions = {
  title: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
};

type ConfirmFn = (opts: ConfirmOptions) => Promise<boolean>;

const ConfirmContext = createContext<ConfirmFn>(async () => false);

/**
 * Fournit une confirmation stylée et accessible (remplace window.confirm()).
 * À monter une fois autour de l'app ; les pages appellent useConfirm().
 */
export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const [opts, setOpts] = useState<ConfirmOptions>({ title: "" });
  const resolverRef = useRef<((v: boolean) => void) | null>(null);

  const confirm = useCallback<ConfirmFn>((o) => {
    setOpts(o);
    setOpen(true);
    return new Promise<boolean>((resolve) => {
      resolverRef.current = resolve;
    });
  }, []);

  const settle = useCallback((value: boolean) => {
    setOpen(false);
    resolverRef.current?.(value);
    resolverRef.current = null;
  }, []);

  // Garde-fou : Radix peut laisser pointer-events:none sur <body> si l'animation
  // de fermeture ne se termine pas (figerait l'app). On le rétablit à la fermeture.
  useEffect(() => {
    if (open) return;
    const id = window.setTimeout(() => {
      document.body.style.pointerEvents = "";
    }, 0);
    return () => window.clearTimeout(id);
  }, [open]);

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      <AlertDialog open={open} onOpenChange={(o) => { if (!o) settle(false); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{opts.title}</AlertDialogTitle>
            {opts.description && <AlertDialogDescription>{opts.description}</AlertDialogDescription>}
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => settle(false)}>{opts.cancelLabel ?? "Annuler"}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => settle(true)}
              className={opts.destructive ? "bg-destructive text-destructive-foreground border-transparent hover:bg-destructive/90" : ""}
            >
              {opts.confirmLabel ?? "Confirmer"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </ConfirmContext.Provider>
  );
}

/** Retourne une fonction async `confirm(opts) => Promise<boolean>`. */
export function useConfirm() {
  return useContext(ConfirmContext);
}
