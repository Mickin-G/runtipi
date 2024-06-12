import { AppQueries } from '@/server/queries/apps/apps.queries';
import { AppLifecycleCommandParams, IAppLifecycleCommand } from './types';
import { EventDispatcher } from '@/server/core/EventDispatcher';
import { castAppConfig } from '@/lib/helpers/castAppConfig';
import { Logger } from '@/server/core/Logger';
import { TranslatedError } from '@/server/utils/errors';

export class StartAppCommand implements IAppLifecycleCommand {
  private queries: AppQueries;
  private eventDispatcher: EventDispatcher;

  constructor(params: AppLifecycleCommandParams) {
    this.queries = params.queries;
    this.eventDispatcher = params.eventDispatcher;
  }

  async execute(params: { appId: string }): Promise<void> {
    const { appId } = params;
    const app = await this.queries.getApp(appId);

    if (!app) {
      throw new TranslatedError('APP_ERROR_APP_NOT_FOUND', { id: appId });
    }

    await this.queries.updateApp(appId, { status: 'starting' });
    void this.eventDispatcher
      .dispatchEventAsync({
        type: 'app',
        command: 'start',
        appid: appId,
        form: castAppConfig(app.config),
      })
      .then(({ success, stdout }) => {
        if (success) {
          this.queries.updateApp(appId, { status: 'running' }).catch(Logger.error);
        } else {
          Logger.error(`Failed to start app ${appId}: ${stdout}`);
          this.queries.updateApp(appId, { status: 'stopped' }).catch(Logger.error);
        }
      });
  }
}
