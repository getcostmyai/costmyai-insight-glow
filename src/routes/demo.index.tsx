import { createFileRoute, redirect } from "@tanstack/react-router";

/** /demo has no page of its own — the overview is the entry level. */
export const Route = createFileRoute("/demo/")({
  beforeLoad: () => {
    throw redirect({ to: "/demo/overview", replace: true });
  },
});
