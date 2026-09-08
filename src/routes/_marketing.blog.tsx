import { createFileRoute, Outlet } from "@tanstack/react-router";

/** Blog layout: the index and the article share the marketing chrome above. */
export const Route = createFileRoute("/_marketing/blog")({
  component: () => <Outlet />,
});
