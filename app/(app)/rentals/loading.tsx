import { ListSkeleton } from "../list-skeleton";

export default function Loading() {
  return <ListSkeleton cards={3} columns={[3, 3, 2, 2, 1, 2, 2]} />;
}
