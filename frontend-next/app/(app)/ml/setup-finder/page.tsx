import SetupFinder from "@/components/ml/SetupFinder";

export const dynamic = "force-dynamic";

export default function Page() {
  return (
    <div className="space-y-5 max-w-[1400px] mx-auto">
      <SetupFinder />
    </div>
  );
}
