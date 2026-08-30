import { Route } from "@/routes/api/public/sync/prices";
console.log(Object.keys((Route as any).options ?? {}));
console.log(JSON.stringify(Object.keys((Route as any).options?.server ?? {})));
console.log(typeof (Route as any).options?.server?.handlers?.POST);
import { it } from "vitest";
it("probe", () => {});
