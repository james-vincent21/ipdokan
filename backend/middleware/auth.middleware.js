import { fromNodeHeaders } from "better-auth/node";
import { createAuthClient } from "better-auth/client";
import { oauthProviderResourceClient } from "@better-auth/oauth-provider/resource-client";
import { auth } from "../lib/auth.js";
import { config } from "../config/env.js";
import { User } from "../models/user.model.js";

const resourceClient = auth ? createAuthClient({ plugins: [oauthProviderResourceClient(auth)] }) : null;

export async function requireAuth(req, res, next) {
  if (!auth) return res.status(503).json({ error: "Authentication is not enabled yet. Configure the backend credentials to continue." });
  try {
    if (req.headers.authorization?.startsWith("Bearer ")) {
      const claims = await resourceClient.verifyAccessTokenRequest({
        authorizationHeader: req.headers.authorization,
        dpopProofJwt: req.headers.dpop,
        method: req.method,
        url: `${config.authUrl}${req.originalUrl}`,
      }, {
        verifyOptions: {
          issuer: `${config.authUrl}/api/auth`,
          audience: config.apiResource,
          typ: "at+jwt",
          requiredClaims: ["azp"],
        },
      });
      req.user = await User.findById(claims.sub);
      if (!req.user) return res.status(401).json({ error: "Please sign in to continue." });
      req.authMethod = "bearer";
      return next();
    }

    const session = await auth.api.getSession({ headers: fromNodeHeaders(req.headers) });
    if (!session) return res.status(401).json({ error: "Please sign in to continue." });
    req.user = session.user;
    req.session = session.session;
    next();
  } catch (error) {
    if (!error.statusCode) return next(error);
    if (error.headers?.forEach) error.headers.forEach((value, name) => res.setHeader(name, value));
    else if (error.headers) for (const [name, value] of Object.entries(error.headers)) res.setHeader(name, value);
    res.status(error.statusCode).json(error.body || { error: "Please sign in to continue." });
  }
}

export async function optionalAuth(req, _res, next) {
  if (!auth) return next();
  try {
    const session = await auth.api.getSession({ headers: fromNodeHeaders(req.headers) });
    if (session?.user) {
      req.user = session.user;
      req.session = session.session;
    }
    next();
  } catch {
    next();
  }
}
