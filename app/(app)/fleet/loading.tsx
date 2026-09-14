import { ListSkeleton } from "../list-skeleton";

export default function Loading() {
  return <ListSkeleton cards={4} columns={[2, 3, 2, 2, 2, 2, 1]} />;
}
