import { cn } from "cn";

function Skeleton({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="skeleton"
      // `bg-chip` e não o `bg-muted` que o shadcn traz: aqui `--muted` é
      // #fafafa, e a mancha sumia dentro do branco do card.
      className={cn("animate-pulse rounded-md bg-chip", className)}
      {...props}
    />
  );
}

export { Skeleton };
