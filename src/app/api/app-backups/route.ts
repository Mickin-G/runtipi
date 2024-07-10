import { ensureUser } from '@/actions/utils/ensure-user';
import { handleApiError } from '@/actions/utils/handle-api-error';
import { appCatalog } from '@/server/services/app-catalog/app-catalog.service';
import { TranslatedError } from '@/server/utils/errors';

const getAppBackups = async (searchParams: URLSearchParams) => {
  const appId = searchParams.get('appId');
  const pageSize = searchParams.get('pageSize') || 10;
  const page = searchParams.get('page') || 1;

  if (!appId) {
    throw new TranslatedError('APP_ERROR_APP_NOT_FOUND', { id: appId });
  }

  return appCatalog.executeCommand('getAppBackups', { appId, pageSize: Number(pageSize), page: Number(page) });
};

export async function GET(request: Request) {
  try {
    await ensureUser();

    const { searchParams } = new URL(request.url);

    const apps = await getAppBackups(searchParams);

    return new Response(JSON.stringify(apps), { headers: { 'content-type': 'application/json' } });
  } catch (error) {
    return handleApiError(error);
  }
}

export type AppBackupsApiResponse = Awaited<ReturnType<typeof getAppBackups>>;
