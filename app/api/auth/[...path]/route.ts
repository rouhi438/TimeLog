import { getAuth } from "../../../../lib/auth";
import type { NextRequest } from "next/server";

export const dynamic = "force-dynamic";

const allowed = new Set([
  "get-session",
  "sign-in/email",
  "sign-out",
  "request-password-reset",
  "reset-password",
  "send-verification-email",
  "verify-email",
  "email-otp/send-verification-otp",
  "email-otp/verify-email",
]);

function permitted(req: NextRequest) {
  const path = req.nextUrl.pathname.split("/api/auth/")[1] || "";
  return allowed.has(path) || path.startsWith("reset-password/");
}

type Handler = ReturnType<ReturnType<typeof getAuth>["handler"]>;

export async function GET(...args: Parameters<Handler["GET"]>) {
  if (!permitted(args[0] as NextRequest))
    return new Response(null, { status: 404 });

  return getAuth()
    .handler()
    .GET(...args);
}

export async function POST(...args: Parameters<Handler["POST"]>) {
  if (!permitted(args[0] as NextRequest))
    return new Response(null, { status: 404 });

  return getAuth()
    .handler()
    .POST(...args);
}
