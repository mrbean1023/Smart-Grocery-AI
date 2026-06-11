import { NextResponse } from "next/server";
import { auth } from "@/auth";

const APP_PREFIXES = [
  "/dashboard",
  "/recipes",
  "/optimize",
  "/baskets",
  "/products",
  "/pantry",
  "/meal-plans",
  "/assistant",
  "/analytics",
  "/settings",
];

const AUTH_PAGES = ["/login", "/register"];

export default auth((req) => {
  const { nextUrl } = req;
  const path = nextUrl.pathname;
  const isLoggedIn = !!req.auth && req.auth.error !== "RefreshTokenExpired";

  const isAppRoute = APP_PREFIXES.some((p) => path === p || path.startsWith(`${p}/`));
  const isAuthPage = AUTH_PAGES.includes(path);

  if (isAppRoute && !isLoggedIn) {
    const login = new URL("/login", nextUrl);
    login.searchParams.set("next", path + nextUrl.search);
    return NextResponse.redirect(login);
  }

  if (isAuthPage && isLoggedIn) {
    return NextResponse.redirect(new URL("/dashboard", nextUrl));
  }

  return NextResponse.next();
});

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico|.*\\..*).*)"],
};
