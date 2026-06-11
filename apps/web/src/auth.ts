import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import Google from "next-auth/providers/google";
import type { JWT } from "next-auth/jwt";
import type { AuthResponse, AuthTokens, UserProfile } from "@smart-grocery/shared";

const API_URL =
  process.env.API_URL ?? process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000/v1";

function packToken(token: JWT, user: UserProfile, tokens: AuthTokens): JWT {
  return {
    ...token,
    sub: user.id,
    accessToken: tokens.accessToken,
    refreshToken: tokens.refreshToken,
    accessTokenExpires: Date.now() + tokens.expiresIn * 1000,
    user,
    error: undefined,
  };
}

async function refreshAccessToken(token: JWT): Promise<JWT> {
  try {
    const res = await fetch(`${API_URL}/auth/refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refreshToken: token.refreshToken }),
    });
    if (!res.ok) throw new Error(`Refresh failed (${res.status})`);
    const data = (await res.json()) as AuthTokens | { tokens: AuthTokens };
    const tokens: AuthTokens = "tokens" in data ? data.tokens : data;
    return {
      ...token,
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken ?? token.refreshToken,
      accessTokenExpires: Date.now() + tokens.expiresIn * 1000,
      error: undefined,
    };
  } catch {
    return { ...token, error: "RefreshTokenExpired" as const };
  }
}

const providers = [
  Credentials({
    name: "Credentials",
    credentials: {
      email: { label: "Email", type: "email" },
      password: { label: "Password", type: "password" },
    },
    async authorize(credentials) {
      if (!credentials?.email || !credentials?.password) return null;
      const res = await fetch(`${API_URL}/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: credentials.email,
          password: credentials.password,
        }),
      });
      if (!res.ok) return null;
      const data = (await res.json()) as AuthResponse;
      return {
        id: data.user.id,
        email: data.user.email,
        name: data.user.name,
        image: data.user.avatarUrl,
        profile: data.user,
        tokens: data.tokens,
      };
    },
  }),
  ...(process.env.GOOGLE_CLIENT_ID
    ? [
        Google({
          clientId: process.env.GOOGLE_CLIENT_ID,
          clientSecret: process.env.GOOGLE_CLIENT_SECRET,
        }),
      ]
    : []),
];

export const { handlers, auth, signIn, signOut } = NextAuth({
  trustHost: true,
  secret: process.env.NEXTAUTH_SECRET,
  session: { strategy: "jwt" },
  pages: { signIn: "/login", error: "/login" },
  providers,
  callbacks: {
    async jwt({ token, user, account }) {
      // Google sign-in: exchange the Google id_token for our API tokens.
      if (account?.provider === "google" && account.id_token) {
        const res = await fetch(`${API_URL}/auth/oauth/google`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ idToken: account.id_token }),
        });
        if (!res.ok) return { ...token, error: "OAuthExchangeFailed" as const };
        const data = (await res.json()) as AuthResponse;
        return packToken(token, data.user, data.tokens);
      }

      // Credentials sign-in: tokens came from authorize().
      if (user?.tokens && user.profile) {
        return packToken(token, user.profile, user.tokens);
      }

      // Still valid (30s clock-skew buffer).
      if (token.accessTokenExpires && Date.now() < token.accessTokenExpires - 30_000) {
        return token;
      }

      return refreshAccessToken(token);
    },
    async session({ session, token }) {
      // Cast needed: AdapterUser types emailVerified as Date while our API
      // profile uses a boolean; the JWT strategy never touches an adapter.
      return {
        ...session,
        user: { ...session.user, ...token.user },
        accessToken: token.accessToken,
        error: token.error,
      } as unknown as typeof session;
    },
  },
});
