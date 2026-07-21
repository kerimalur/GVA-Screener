import OutlookView from "@/components/journal/OutlookView";
import { loadFundamentalContext } from "@/lib/cockpit/detailServer";

export const dynamic = "force-dynamic";
export const metadata = { title: "Outlook — FX Terminal" };

export default async function OutlookPage() {
  // Verdikt, Quintile und High-Impact-Termine kommen aus derselben Quelle wie
  // im Cockpit — die Detailansicht darf sie nicht anders herleiten als die
  // Karte, von der aus man sie geöffnet hat.
  const { quintiles, rankingByCcy, eventsByCcy } = await loadFundamentalContext();

  return (
    <OutlookView
      quintiles={quintiles}
      rankingByCcy={rankingByCcy}
      eventsByCcy={eventsByCcy}
    />
  );
}
