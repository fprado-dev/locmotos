import { Skeleton } from "@/components/ui/skeleton";

/** A casca da ficha de uma moto. Ver `app/(app)/list-skeleton.tsx` para o porquê. */
export default function Loading() {
  return (
    <>
      <header className="flex h-16 shrink-0 items-center justify-between gap-4 border-b border-border px-8">
        <Skeleton className="h-6 w-[260px]" />
        <div className="flex items-center gap-3">
          <Skeleton className="h-9 w-[150px]" />
          <Skeleton className="h-9 w-20" />
        </div>
      </header>

      <div className="flex flex-1 flex-col gap-6 overflow-auto px-8 py-6">
        <div className="grid max-w-[720px] gap-5 sm:grid-cols-2">
          {Array.from({ length: 6 }, (_, i) => (
            <div key={i} className="flex flex-col gap-1.5">
              <Skeleton className="h-3 w-24" />
              <Skeleton className="h-9 w-full" />
            </div>
          ))}
        </div>

        <div className="border-t border-border pt-6">
          <Skeleton className="h-4 w-40" />
        </div>
      </div>
    </>
  );
}
