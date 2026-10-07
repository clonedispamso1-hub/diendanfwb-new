import { createFileRoute, redirect } from "@tanstack/react-router";
export const Route = createFileRoute("/ket-noi-bi-mat")({ beforeLoad: () => { throw redirect({ to: "/", replace: true }); } });
