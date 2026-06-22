import NextAuth from 'next-auth';
import authConfig from './auth.config';

// Edge-runtime proxy (Next 16's renamed middleware): gate the app behind a session. Uses the
// edge-safe config only (no DB), so it just checks for a valid JWT and redirects to /login.
const { auth } = NextAuth(authConfig);

export default auth((req) => {
  const p = req.nextUrl.pathname;
  const isProtected = p === '/' || p.startsWith('/learners') || p.startsWith('/dashboard');
  if (isProtected && !req.auth) {
    return Response.redirect(new URL('/login', req.nextUrl));
  }
});

export const config = {
  // Run on everything except Next internals, the auth API, and static assets.
  matcher: ['/((?!api/auth|_next/static|_next/image|favicon.ico).*)'],
};
