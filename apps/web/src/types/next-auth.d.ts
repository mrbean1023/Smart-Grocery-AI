import type { UserProfile } from "@smart-grocery/shared";
import type { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface Session {
    user: UserProfile & DefaultSession["user"];
    accessToken: string;
    error?: "RefreshTokenExpired" | "OAuthExchangeFailed";
  }

  interface User {
    profile?: UserProfile;
    tokens?: {
      accessToken: string;
      refreshToken: string;
      expiresIn: number;
    };
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    accessToken: string;
    refreshToken: string;
    accessTokenExpires: number;
    user: UserProfile;
    error?: "RefreshTokenExpired" | "OAuthExchangeFailed";
  }
}
