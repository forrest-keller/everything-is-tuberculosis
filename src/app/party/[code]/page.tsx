import { PartyRoom } from "./party-room";

export default async function PartyCodePage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code } = await params;
  return <PartyRoom code={code.toUpperCase()} />;
}
