import { AppQueries } from '@/server/queries/apps/apps.queries';
import { AppLifecycleCommandParams, IAppLifecycleCommand } from './types';
import { EventDispatcher } from '@/server/core/EventDispatcher';
import { AppEventFormInput } from '@runtipi/shared';
import { TranslatedError } from '@/server/utils/errors';
import validator from 'validator';
import { AppDataService } from '@runtipi/shared/node';

export class UpdateAppConfigCommand implements IAppLifecycleCommand {
  private queries: AppQueries;
  private eventDispatcher: EventDispatcher;
  private appDataService: AppDataService;

  constructor(params: AppLifecycleCommandParams) {
    this.queries = params.queries;
    this.eventDispatcher = params.eventDispatcher;
    this.appDataService = params.appDataService;
  }

  async execute(params: { appId: string; form: AppEventFormInput }): Promise<void> {
    const { appId, form } = params;

    const { exposed, domain } = form;

    if (exposed && !domain) {
      throw new TranslatedError('APP_ERROR_DOMAIN_REQUIRED_IF_EXPOSE_APP');
    }

    if (domain && !validator.isFQDN(domain)) {
      throw new TranslatedError('APP_ERROR_DOMAIN_NOT_VALID');
    }

    const app = await this.queries.getApp(appId);

    if (!app) {
      throw new TranslatedError('APP_ERROR_APP_NOT_FOUND', { id: appId });
    }

    const appInfo = await this.appDataService.getInstalledInfo(appId);

    if (!appInfo) {
      throw new TranslatedError('APP_ERROR_APP_NOT_FOUND', { id: appId });
    }

    if (!appInfo.exposable && exposed) {
      throw new TranslatedError('APP_ERROR_APP_NOT_EXPOSABLE', { id: appId });
    }

    if (appInfo.force_expose && !exposed) {
      throw new TranslatedError('APP_ERROR_APP_FORCE_EXPOSED', { id: appId });
    }

    if (exposed && domain) {
      const appsWithSameDomain = await this.queries.getAppsByDomain(domain, appId);

      if (appsWithSameDomain.length > 0) {
        throw new TranslatedError('APP_ERROR_DOMAIN_ALREADY_IN_USE', { domain, id: appsWithSameDomain[0]?.id });
      }
    }

    const { success } = await this.eventDispatcher.dispatchEventAsync({ type: 'app', command: 'generate_env', appid: appId, form });

    if (!success) {
      throw new TranslatedError('APP_ERROR_APP_FAILED_TO_UPDATE', { id: appId });
    }

    await this.queries.updateApp(appId, {
      exposed: exposed || false,
      exposedLocal: form.exposedLocal || false,
      openPort: form.openPort || false,
      domain: domain || null,
      config: form,
      isVisibleOnGuestDashboard: form.isVisibleOnGuestDashboard,
    });
  }
}
