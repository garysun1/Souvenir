export default function CapturePage() { return <Placeholder heading="Capture" owner="Capture & Reveal" />; }
function Placeholder({ heading, owner }: { heading: string; owner: string }) { return <div className="space-y-3 p-5"><h1 className="text-3xl font-semibold">{heading}</h1><p className="text-muted-foreground">Owner: {owner}</p></div>; }
