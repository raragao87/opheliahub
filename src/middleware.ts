import NextAuth from "next-auth";
import authConfig from "./auth.config";

const { auth } = NextAuth(authConfig);

export default auth((req) => {
  const isLoggedIn = !!req.auth;
  const { pathname } = req.nextUrl;

  const isPublicRoute =
    pathname === "/login" ||
    pathname === "/" ||
    pathname.startsWith("/api/auth") ||
    pathname === "/api/ophelia/categorize" || // cron — protected by Bearer token
    pathname.startsWith("/api/cron"); // cron endpoints — protected by Bearer token

  if (!isLoggedIn && !isPublicRoute) {
    return Response.redirect(new URL("/login", req.nextUrl));
  }
});

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
