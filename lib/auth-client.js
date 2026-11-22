import { createAuthClient } from "better-auth/react";
import { oauthProviderClient } from "@better-auth/oauth-provider/client";

const backendUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";

export const authClient = createAuthClient({
  baseURL: `${backendUrl}/api/auth`,
  fetchOptions: { credentials: "include" },
  plugins: [oauthProviderClient()],
});
