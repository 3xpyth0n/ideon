import { ProjectList } from "@components/dashboard/ProjectList";

export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string }>;
}) {
  const { view } = await searchParams;
  return (
    <div className="island-content">
      <ProjectList view={view} />
    </div>
  );
}
