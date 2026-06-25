// proxy.ts

import NextAuth from "next-auth";

import authConfig from "./auth.config";
import {
  DEFAULT_LOGIN_REDIRECT,
  apiAuthPrefix,
  publicRoutes,
  authRoutes,
} from "@/routes";

const { auth } = NextAuth(authConfig);

export default auth((req) => {
  const { nextUrl } = req;
  const isLoggedIn = !!req.auth;

  const isApiAuthRoute =
    nextUrl.pathname.startsWith(apiAuthPrefix);

  const isPublicRoute =
    publicRoutes.includes(nextUrl.pathname);

  const isAuthRoute =
    authRoutes.includes(nextUrl.pathname);

  // Allow Auth.js API routes
  if (isApiAuthRoute) {
    return null;
  }

  // Redirect logged-in users away from auth pages
  if (isAuthRoute) {
    if (isLoggedIn) {
      return Response.redirect(
        new URL(DEFAULT_LOGIN_REDIRECT, nextUrl)
      );
    }

    return null;
  }

  // Protect private routes
  if (!isLoggedIn && !isPublicRoute) {
    return Response.redirect(
      new URL("/auth/sign-in", nextUrl)
    );
  }

  return null;
});

export const config = {
  matcher: [
    "/((?!.+\\.[\\w]+$|_next).*)",
    "/",
    "/(api|trpc)(.*)",
  ],
};