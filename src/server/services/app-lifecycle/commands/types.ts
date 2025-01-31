import type { IEventDispatcher } from '@/server/core/EventDispatcher/EventDispatcher';
import type { IAppQueries } from '@/server/queries/apps/apps.queries';
import type { IAppDataService } from '@runtipi/shared/node';

export interface IAppLifecycleCommand<T = unknown> {
  execute(...args: unknown[]): Promise<T>;
}

export type AppLifecycleCommandParams = {
  queries: IAppQueries;
  eventDispatcher: IEventDispatcher;
  appDataService: IAppDataService;
  executeOtherCommand: IAppLifecycleCommand['execute'];
};
