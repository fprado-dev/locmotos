import { ListSkeleton } from "../list-skeleton";

export default function Loading() {
  return <ListSkeleton cards={5} columns={[3, 2, 2, 2, 2, 2]} />;
}
