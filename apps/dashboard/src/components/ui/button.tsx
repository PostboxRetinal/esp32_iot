import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--ring)] disabled:pointer-events-none disabled:opacity-50",
  {
    variants: {
      variant: {
        default: "bg-[var(--muted)] text-[var(--foreground)] shadow-none hover:bg-[#262626]",
        secondary: "border border-[var(--border)] bg-transparent text-[var(--foreground)] hover:bg-[var(--accent)] hover:text-[var(--accent-foreground)]",
        ghost: "text-[var(--foreground)] hover:bg-[var(--accent)] hover:text-[var(--accent-foreground)]",
        outline: "border border-[var(--border)] bg-transparent text-[var(--foreground)] hover:bg-[var(--accent)] hover:text-[var(--accent-foreground)]",
        destructive: "bg-[var(--destructive)] text-[var(--destructive-foreground)] hover:bg-red-600",
        link: "text-[var(--foreground)] underline-offset-4 hover:underline"
      },
      size: {
        default: "h-10 px-4 py-2",
        sm: "h-9 rounded-md px-3",
        lg: "h-11 rounded-md px-8",
        icon: "h-10 w-10"
      }
    },
    defaultVariants: {
      variant: "default",
      size: "default"
    }
  }
);

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(({ className, variant, size, asChild = false, ...props }, ref) => {
  const Comp = asChild ? Slot : "button";

  return <Comp ref={ref} className={cn(buttonVariants({ variant, size, className }))} {...props} />;
});

Button.displayName = "Button";

export { Button, buttonVariants };
