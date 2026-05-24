/** @type {import('next').NextConfig} */
const nextConfig = {
  // Server-side only — never expose LDAP logic to client
  experimental: {
    serverComponentsExternalPackages: ["ldapjs", "ldap-authentication"],
  },
};

module.exports = nextConfig;
