import { NextAuthOptions } from 'next-auth';
import GitHubProvider from 'next-auth/providers/github';
import { createOrUpdateUser, getUserByGithubId } from './db';

declare module 'next-auth' {
  interface Session {
    user: {
      id: string;
      name?: string | null;
      email?: string | null;
      image?: string | null;
      isAdmin: boolean;
      githubUsername: string;
    };
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    id: string;
    isAdmin: boolean;
    githubUsername: string;
  }
}

export const authOptions: NextAuthOptions = {
  providers: [
    GitHubProvider({
      clientId: process.env.GITHUB_CLIENT_ID!,
      clientSecret: process.env.GITHUB_CLIENT_SECRET!,
    }),
  ],
  callbacks: {
    async signIn({ user, account, profile }) {
      if (account?.provider === 'github' && profile) {
        const githubProfile = profile as { login: string; avatar_url: string };
        await createOrUpdateUser({
          githubId: account.providerAccountId,
          githubUsername: githubProfile.login,
          email: user.email || null,
          name: user.name || null,
          avatarUrl: githubProfile.avatar_url || user.image || null,
        });
      }
      return true;
    },
    async jwt({ token, account, profile }) {
      if (account?.provider === 'github') {
        const githubProfile = profile as { login: string };
        const dbUser = await getUserByGithubId(account.providerAccountId);
        token.id = dbUser?.id || account.providerAccountId;
        token.isAdmin = dbUser?.isAdmin || false;
        token.githubUsername = githubProfile.login;
      }
      return token;
    },
    async session({ session, token }) {
      session.user.id = token.id;
      session.user.isAdmin = token.isAdmin;
      session.user.githubUsername = token.githubUsername;
      return session;
    },
  },
  pages: {
    signIn: '/',
  },
};
