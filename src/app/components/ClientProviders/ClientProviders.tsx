'use client';

import 'reflect-metadata';
import type React from 'react';
import { type AbstractIntlMessages, NextIntlClientProvider } from 'next-intl';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ThemeProvider } from './ThemeProvider';
import { SocketProvider } from './SocketProvider/SocketProvider';
import type { AppStatus } from '@runtipi/db';
import { AppStatusStoreProvider } from './AppStatusProvider/app-status-provider';
import { ClientSettingsStoreProvider } from './ClientSettingsProvider/ClientSettingsProvider';
import type { settingsSchema } from '@runtipi/shared';
import type { z } from 'zod';

type Props = {
  children: React.ReactNode;
  initialTheme?: string;
  locale?: string;
  messages: AbstractIntlMessages;
  appStatuses: Record<string, AppStatus>;
  clientSettings: z.infer<typeof settingsSchema>;
};

const queryClient = new QueryClient({ defaultOptions: { queries: { refetchOnWindowFocus: false } } });

export const ClientProviders = ({ children, initialTheme, locale, messages, appStatuses, clientSettings }: Props) => {
  return (
    <QueryClientProvider client={queryClient}>
      <NextIntlClientProvider locale={locale} messages={messages} timeZone={Intl.DateTimeFormat().resolvedOptions().timeZone}>
        <ClientSettingsStoreProvider initialSettings={clientSettings}>
          <AppStatusStoreProvider initialStatuses={appStatuses}>
            <SocketProvider>
              <ThemeProvider initialTheme={initialTheme}>{children}</ThemeProvider>
            </SocketProvider>
          </AppStatusStoreProvider>
        </ClientSettingsStoreProvider>
      </NextIntlClientProvider>
    </QueryClientProvider>
  );
};
