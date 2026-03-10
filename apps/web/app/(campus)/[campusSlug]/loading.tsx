import { ListingGridSkeleton } from '../../../components/listing-skeleton';

export default function CampusLoading() {
  return (
    <div className="animate-fade-in">
      <div className="h-8 w-48 rounded-lg skeleton" />
      <div className="mt-2 h-5 w-80 rounded-lg skeleton" />
      <div className="mt-8">
        <ListingGridSkeleton count={6} />
      </div>
    </div>
  );
}
