import { parseArgs } from "node:util";
import { closeDb } from "../src/lib/db";
import { assertDisposableDatabase } from "../src/lib/places";
import { enrichPlace, purgeExpiredSourceData } from "../src/lib/places/enrich";

async function main() {
  const { values } = parseArgs({
    options: {
      place: { type: "string" },
      "confirm-image": { type: "string" },
      "purge-expired": { type: "boolean", default: false },
      apply: { type: "boolean", default: false },
    },
  });
  assertDisposableDatabase();
  if (!values.apply) throw new Error("Use --apply to acknowledge changes.");
  if (values["purge-expired"]) {
    if (values.place || values["confirm-image"])
      throw new Error("Do not combine cleanup and enrichment.");
    console.log(JSON.stringify({ purged: await purgeExpiredSourceData() }));
  } else {
    if (!values.place) throw new Error("Select an exact --place UUID.");
    const result = await enrichPlace(values.place, { confirmedImage: values["confirm-image"] });
    console.log(JSON.stringify(result));
  }
}
main()
  .catch(() => {
    console.error(
      "Enrichment failed. Check disposable DB acknowledgement, --apply, exact --place and eligible --confirm-image; provider errors require retry or review.",
    );
    process.exitCode = 1;
  })
  .finally(closeDb);
