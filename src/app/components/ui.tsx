import React from "react";
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function Card({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("rounded-xl border border-zinc-800 bg-zinc-950/50 text-zinc-100 shadow-sm backdrop-blur-sm", className)}
      {...props}
    />
  );
}

export function CardHeader({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("flex flex-col space-y-1.5 p-6", className)} {...props} />;
}

export function CardTitle({ className, ...props }: React.HTMLAttributes<HTMLHeadingElement>) {
  return (
    <h3
      className={cn("text-lg font-semibold leading-none tracking-tight", className)}
      {...props}
    />
  );
}

export function CardContent({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("p-6 pt-0", className)} {...props} />;
}

export function Badge({ className, variant = "default", ...props }: React.HTMLAttributes<HTMLDivElement> & { variant?: "default" | "destructive" | "warning" | "success" | "outline" }) {
  const variants = {
    default: "border-transparent bg-zinc-800 text-zinc-100 hover:bg-zinc-700",
    destructive: "border-transparent bg-red-900/50 text-red-400 hover:bg-red-900/70 border border-red-800",
    warning: "border-transparent bg-amber-900/50 text-amber-400 hover:bg-amber-900/70 border border-amber-800",
    success: "border-transparent bg-emerald-900/50 text-emerald-400 hover:bg-emerald-900/70 border border-emerald-800",
    outline: "text-zinc-100 border-zinc-700",
  };
  return (
    <div
      className={cn(
        "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-zinc-400 focus:ring-offset-2",
        variants[variant],
        className
      )}
      {...props}
    />
  );
}

export function Button({ className, variant = "default", size = "default", ...props }: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "default" | "destructive" | "outline" | "secondary" | "ghost" | "link", size?: "default" | "sm" | "lg" | "icon" }) {
  const variants = {
    default: "bg-zinc-100 text-zinc-900 hover:bg-zinc-200/90",
    destructive: "bg-red-900 text-zinc-100 hover:bg-red-900/90",
    outline: "border border-zinc-800 bg-transparent hover:bg-zinc-800 text-zinc-100",
    secondary: "bg-zinc-800 text-zinc-100 hover:bg-zinc-800/80",
    ghost: "hover:bg-zinc-800 hover:text-zinc-100 text-zinc-400",
    link: "text-zinc-100 underline-offset-4 hover:underline",
  };
  const sizes = {
    default: "h-10 px-4 py-2",
    sm: "h-9 rounded-md px-3",
    lg: "h-11 rounded-md px-8",
    icon: "h-10 w-10",
  };
  return (
    <button
      className={cn(
        "inline-flex items-center justify-center rounded-md text-sm font-medium ring-offset-zinc-950 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-800 focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50",
        variants[variant],
        sizes[size],
        className
      )}
      {...props}
    />
  );
}

export function Alert({ className, variant = "default", ...props }: React.HTMLAttributes<HTMLDivElement> & { variant?: "default" | "destructive" | "warning" }) {
  const variants = {
    default: "bg-zinc-950 text-zinc-100 border-zinc-800",
    destructive: "border-red-900/50 text-red-500 [&>svg]:text-red-500 bg-red-950/20",
    warning: "border-amber-900/50 text-amber-500 [&>svg]:text-amber-500 bg-amber-950/20",
  };
  return (
    <div
      role="alert"
      className={cn(
        "relative w-full rounded-lg border p-4 [&>svg~*]:pl-7 [&>svg+div]:translate-y-[-3px] [&>svg]:absolute [&>svg]:left-4 [&>svg]:top-4 [&>svg]:text-zinc-100",
        variants[variant],
        className
      )}
      {...props}
    />
  );
}

export function AlertTitle({ className, ...props }: React.HTMLAttributes<HTMLHeadingElement>) {
  return (
    <h5
      className={cn("mb-1 font-medium leading-none tracking-tight", className)}
      {...props}
    />
  );
}

export function AlertDescription({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("text-sm [&_p]:leading-relaxed opacity-90", className)}
      {...props}
    />
  );
}

export function Progress({ className, value, indicatorColor, ...props }: React.HTMLAttributes<HTMLDivElement> & { value: number; indicatorColor?: string }) {
  return (
    <div
      className={cn("relative h-4 w-full overflow-hidden rounded-full bg-zinc-800", className)}
      {...props}
    >
      <div
        className={cn("h-full w-full flex-1 bg-zinc-100 transition-all", indicatorColor)}
        style={{ transform: `translateX(-${100 - (value || 0)}%)` }}
      />
    </div>
  );
}

export function ToggleGroup({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn("inline-flex bg-zinc-900/50 border border-zinc-800 rounded-lg p-1 space-x-1", className)} {...props} />
  );
}

export function ToggleGroupItem({ className, active, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement> & { active?: boolean }) {
  return (
    <button
      className={cn(
        "inline-flex items-center justify-center rounded-md px-3 py-1.5 text-sm font-medium transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400 disabled:pointer-events-none disabled:opacity-50",
        active ? "bg-zinc-800 text-zinc-100 shadow-sm" : "text-zinc-400 hover:bg-zinc-800/50 hover:text-zinc-200",
        className
      )}
      {...props}
    />
  );
}
