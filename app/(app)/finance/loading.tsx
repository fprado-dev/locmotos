import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

/** A casca do caixa. Ver `app/(app)/list-skeleton.tsx` para o porquê. */
export default function Loading() {
  return (
    <>
      <header className="flex h-16 shrink-0 items-center justify-between gap-4 px-8">
        <Skeleton className="h-6 w-[240px]" />
        <div className="flex items-center gap-2">
          <Skeleton className="h-8 w-9" />
          <Skeleton className="h-8 w-9" />
          <Skeleton className="h-9 w-[140px]" />
        </div>
      </header>

      <div className="flex min-h-0 flex-1 flex-col gap-4 px-8 pb-6">
        <section className="mt-1 grid shrink-0 grid-cols-3 gap-3">
          {Array.from({ length: 3 }, (_, i) => (
            <Card
              key={i}
              className="gap-2 rounded-[10px] bg-card px-[18px] py-4 ring-1 ring-border"
            >
              <Skeleton className="h-3 w-16" />
              <Skeleton className="h-[26px] w-28" />
              <Skeleton className="h-3 w-36" />
            </Card>
          ))}
        </section>

        <div className="flex flex-col overflow-hidden rounded-[10px] border border-border bg-card">
          {Array.from({ length: 10 }, (_, i) => (
            <div
              key={i}
              className="flex h-12 shrink-0 items-center gap-3 border-b border-border px-[18px] last:border-b-0"
            >
              <Skeleton className="h-3 w-[52px]" />
              <Skeleton className="h-3 flex-1" />
              <Skeleton className="h-3 w-24" />
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
