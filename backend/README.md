# IP Dokan API

The modular Express API uses Better Auth's official MongoDB adapter on the MongoClient connection opened by Mongoose. A Mongoose model handles profile reads and updates against Better Auth's user collection. Better Auth handles email/password login, sessions, and OAuth 2.1 token grants. The JWT plugin signs short-lived OAuth access tokens; refresh tokens are long-lived, opaque, rotated on use, and stored hashed by Better Auth.

## Start locally

1. Copy the root `.env.example` to `.env`.
2. Run `npm install`.
3. Keep `AUTH_ENABLED=false` while credentials are missing.
4. Start the API with `npm run backend:dev` and the website with `npm run dev` in separate terminals.

To enable authentication, set `AUTH_ENABLED=true`, provide `MONGODB_URI`, and set `BETTER_AUTH_SECRET` to a strong random secret. Set `BETTER_AUTH_URL` to the public API origin and `FRONTEND_ORIGIN` to the website origin. `API_RESOURCE` must be an absolute URL identifying the protected API. Keep `.env` private; it is git-ignored.

Set `ADMIN_EMAILS` to a comma-separated list of account email addresses allowed to use `/admin` and `/api/admin`. Admin accounts must sign in normally first. The admin panel can add/edit catalog products, set an image URL, add unique delivery codes in batches, inspect users and orders, and confirm or cancel pending orders. Keep delivery codes private; they are never included in the public catalog response.

For a local demo administrator, set `DEMO_ADMIN_ENABLED=true` and `DEMO_ADMIN_EMAIL` in `.env`, then run `npm run backend:seed-demo-admin`. Set `DEMO_ADMIN_PASSWORD` (at least 10 characters) yourself, or leave it blank and the command generates a random password once and prints it. The demo email is automatically allowlisted as an admin while the opt-in is enabled. The seed command refuses to run in production, and the backend will refuse `DEMO_ADMIN_ENABLED=true` when `NODE_ENV=production`.

Google sign-in uses `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` from the Google Cloud Console. For local development, register `http://localhost:3000` as an authorized JavaScript origin and `http://localhost:4000/api/auth/callback/google` as the redirect URI.

The API accepts the Better Auth session cookie for the user's own profile and JWT access tokens in `Authorization: Bearer <token>` for protected API requests. Production deployments should use HTTPS.

## Auth and token endpoints

Better Auth is mounted at `/api/auth`:

- `POST /api/auth/sign-up/email` — create an account.
- `POST /api/auth/sign-in/email` — sign in.
- `POST /api/auth/sign-out` — end the current session.
- `GET /api/auth/oauth2/authorize` and `POST /api/auth/oauth2/token` — OAuth 2.1 authorization code and refresh-token grants.
- `POST /api/auth/oauth2/revoke` — revoke a refresh token.
- `GET /api/auth/jwks` — public keys used to verify JWT access tokens.

OAuth clients must use PKCE with `S256`, request the `offline_access` scope and the configured `API_RESOURCE`, and be linked to that resource. Access tokens expire after 15 minutes; refresh tokens expire after 30 days and rotate on refresh. Better Auth revokes a token family if a rotated refresh token is replayed.

Signed-in users can create a public OAuth client from `/profile` by providing its exact redirect URI. Public clients have no client secret; protect the authorization code with PKCE `S256`. Better Auth applies the configured API resource to new clients.

`GET /api/health` reports whether auth is enabled. `GET /api/profile` reads the signed-in user's profile, and `PATCH /api/profile` updates the name or phone number. Both routes accept a Better Auth session cookie or a valid API access token.

`GET /api/products` returns active products with available stock. Signed-in customers can create a pending order with `POST /api/orders`, passing `productId` and a whole-number `quantity`; this reserves one unique inventory code per unit and charges the product price multiplied by that quantity. `GET /api/orders` returns only the current user's orders, and reveals all assigned codes only after the order is paid. The current project has no payment gateway integration: admins must verify payment outside the app, then confirm it in `/admin`. Confirmation marks every reserved code as sold and delivers them to the user's profile. Cancelling a pending order returns all its codes to stock.

The catalog links to product details and `/checkout`. Customers can add products to a browser cart or buy now. Placing an order creates a pending order and reserves inventory; card payment runs through Stripe Checkout. Configure `STRIPE_SECRET_KEY` with a test-mode `sk_test_...` key and `STRIPE_WEBHOOK_SECRET` with the signing secret printed by `stripe listen --forward-to localhost:4000/api/payments/stripe/webhook`. The verified `checkout.session.completed` webhook marks paid orders and releases their delivery codes. Use Stripe's test card `4242 4242 4242 4242`, any future expiry, and any CVC while using test keys. Never use test cards with live keys.

Admins can set available quantity directly: increasing stock requires one new unique delivery code per extra unit, while reducing stock removes only unused codes.

## Modules

- `server.js` — starts Express and connects MongoDB when auth is enabled.
- `app.js` — CORS, Better Auth handler, and API route mounting.
- `config/` — environment and database setup.
- `lib/auth.js` — Better Auth, MongoDB adapter, JWT, and OAuth Provider configuration.
- `models/` — Mongoose model for Better Auth users.
- `routes/`, `controllers/`, `middleware/` — profile endpoints and access checks.
