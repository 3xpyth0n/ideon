import { ProjectList } from "@components/dashboard/ProjectList";

export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string; folderId?: string }>;
}) {
  const { view, folderId } = await searchParams;
  return (
    <div className="island-content">
      <ProjectList
        key={`${view || "all"}-${folderId || "root"}`}
        view={view}
        folderId={folderId}
      />
    </div>
  );
}
