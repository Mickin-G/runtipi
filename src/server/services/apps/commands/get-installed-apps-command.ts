import { AppQueries } from '@/server/queries/apps/apps.queries';
import { getAppInfo, getUpdateInfo } from '../apps.helpers';
import { notEmpty } from '@/server/common/typescript.helpers';
import { ICommand } from './types';

type ReturnValue = Awaited<ReturnType<InstanceType<typeof GetInstalledAppsCommand>['execute']>>;

export class GetInstalledAppsCommand implements ICommand<ReturnValue> {
  constructor(private queries: AppQueries) {}

  async execute() {
    const apps = await this.queries.getApps();

    const res = apps
      .map((app) => {
        const info = getAppInfo(app.id, app.status);
        const updateInfo = getUpdateInfo(app.id);
        if (info) {
          return { ...app, ...updateInfo, info };
        }
        return null;
      })
      .filter(notEmpty);

    return res;
  }
}
