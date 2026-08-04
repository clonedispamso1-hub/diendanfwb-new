// @ts-nocheck
import { Toaster as Sonner, toast } from "sonner";
import { useEffect } from "react";

type ToasterProps = React.ComponentProps<typeof Sonner>;

/**
 * Sonner toaster tuned for the app:
 *  - Auto-dismiss ~1.2s (feels snappy but leaves time for the fade transition).
 *  - Click a toast anywhere → dismiss immediately with fade-out.
 *  - Smooth fade animation on both enter and exit.
 */
const Toaster = ({ ...props }: ToasterProps) => {
  useEffect(() => {
    if (typeof document === "undefined") return;
    if (document.getElementById("sonner-fast-fade-style")) return;
    const style = document.createElement("style");
    style.id = "sonner-fast-fade-style";
    style.textContent = `
      [data-sonner-toaster] [data-sonner-toast] {
        transition: opacity 320ms ease, transform 320ms ease !important;
        cursor: pointer;
      }
      [data-sonner-toaster] [data-sonner-toast][data-removed="true"] {
        opacity: 0 !important;
        transform: translateY(-6px) scale(.98) !important;
      }
    `;
    document.head.appendChild(style);
  }, []);

  return (
    <Sonner
      className="toaster group"
      gap={12}
      duration={1200}
      toastOptions={{
        duration: 1200,
        onClick: (t: any) => {
          try {
            toast.dismiss(t?.id);
          } catch {
            /* ignore */
          }
        },
        classNames: {
          toast:
            "group toast group-[.toaster]:bg-background group-[.toaster]:text-foreground group-[.toaster]:border-border group-[.toaster]:rounded-xl group-[.toaster]:shadow-xl group-[.toaster]:p-4",
          description: "group-[.toast]:text-muted-foreground",
          actionButton: "group-[.toast]:bg-primary group-[.toast]:text-primary-foreground",
          cancelButton: "group-[.toast]:bg-muted group-[.toast]:text-muted-foreground",
        },
      }}
      {...props}
    />
  );
};

export { Toaster };
