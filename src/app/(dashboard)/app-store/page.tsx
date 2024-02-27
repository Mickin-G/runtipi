import { AppServiceClass } from '@/server/services/apps/apps.service';
import React from 'react';
import { Metadata } from 'next';
import { getTranslatorFromCookie } from '@/lib/get-translator';
import { AppStoreTable } from './components/AppStoreTable';

export async function generateMetadata(): Promise<Metadata> {
  const translator = await getTranslatorFromCookie();

  return {
    title: `${translator('APP_STORE_TITLE')} - Tipi`,
  };
}

export default async function AppStorePage() {
  const appsService = new AppServiceClass();
  const apps = await appsService.searchApps({ pageSize: 18 });

  return <AppStoreTable initialData={apps} />;
}
