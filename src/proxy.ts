import { NextResponse, type NextRequest } from "next/server";
import { isControllerHost } from "./server/controller-origin";

export function proxy(request: NextRequest) {
  if (!isControllerHost(request.headers.get("host") ?? ""))
    return new NextResponse("This controller only accepts loopback hosts.", {
      status: 403,
    });
  return NextResponse.next();
}
