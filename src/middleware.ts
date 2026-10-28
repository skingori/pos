import { withAuth } from "next-auth/middleware";

export default withAuth({
  pages: { signIn: "/login" },
});

export const config = {
  matcher: [
    "/overview/:path*",
    "/pos/:path*",
    "/cash/:path*",
    "/inventory/:path*",
    "/purchasing/:path*",
    "/branches/:path*",
    "/sales/:path*",
    "/receipts/:path*",
    "/customers/:path*",
    "/reports/:path*",
    "/accounting/:path*",
    "/receivables/:path*",
    "/refunds/:path*",
    "/audit/:path*",
    "/settings/:path*",
    "/users/:path*",
    "/promotions/:path*",
    "/change-password",
  ],
};
