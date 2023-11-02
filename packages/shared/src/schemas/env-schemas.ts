import { z } from 'zod';

export const ARCHITECTURES = {
  ARM: 'arm',
  ARM64: 'arm64',
  AMD64: 'amd64',
} as const;
export type Architecture = (typeof ARCHITECTURES)[keyof typeof ARCHITECTURES];

export const envSchema = z.object({
  NODE_ENV: z.union([z.literal('development'), z.literal('production'), z.literal('test')]),
  REDIS_HOST: z.string(),
  redisPassword: z.string(),
  status: z.union([z.literal('RUNNING'), z.literal('UPDATING'), z.literal('RESTARTING')]),
  architecture: z.nativeEnum(ARCHITECTURES),
  dnsIp: z.string().ip().trim(),
  rootFolder: z.string(),
  internalIp: z.string(),
  version: z.string(),
  jwtSecret: z.string(),
  appsRepoId: z.string(),
  appsRepoUrl: z.string().url().trim(),
  domain: z.string().trim(),
  localDomain: z.string().trim(),
  storagePath: z
    .string()
    .trim()
    .optional()
    .transform((value) => {
      if (!value) return undefined;
      return value?.replace(/\s/g, '');
    }),
  postgresHost: z.string(),
  postgresDatabase: z.string(),
  postgresUsername: z.string(),
  postgresPassword: z.string(),
  postgresPort: z.number(),
  demoMode: z
    .string()
    .or(z.boolean())
    .optional()
    .transform((value) => {
      if (typeof value === 'boolean') return value;
      return value === 'true';
    }),
  guestDashboard: z
    .string()
    .or(z.boolean())
    .optional()
    .transform((value) => {
      if (typeof value === 'boolean') return value;
      return value === 'true';
    }),
  seePreReleaseVersions: z
    .string()
    .or(z.boolean())
    .optional()
    .transform((value) => {
      if (typeof value === 'boolean') return value;
      return value === 'true';
    }),
});

export const settingsSchema = envSchema
  .partial()
  .pick({ dnsIp: true, internalIp: true, appsRepoUrl: true, domain: true, storagePath: true, localDomain: true, demoMode: true, guestDashboard: true })
  .and(z.object({ port: z.number(), sslPort: z.number(), listenIp: z.string().ip().trim() }).partial());
