import { DataSource } from 'typeorm';
import fs from 'fs-extra';
import { faker } from '@faker-js/faker';
import { setupConnection, teardownConnection } from '../../../test/connection';
import { gcall } from '../../../test/gcall';
import App from '../app.entity';
import { getAppQuery, InstalledAppsQuery, listAppInfosQuery } from '../../../test/queries';
import { createApp } from './apps.factory';
import { AppInfo, AppStatusEnum, ListAppsResonse } from '../apps.types';
import { createUser } from '../../auth/__tests__/user.factory';
import User from '../../auth/user.entity';
import { installAppMutation, startAppMutation, stopAppMutation, uninstallAppMutation, updateAppConfigMutation, updateAppMutation } from '../../../test/mutations';
import EventDispatcher from '../../../core/config/EventDispatcher';

jest.mock('fs');
jest.mock('child_process');

type TApp = App & {
  info: AppInfo;
};

let db: DataSource | null = null;
const TEST_SUITE = 'appsresolver';

beforeAll(async () => {
  db = await setupConnection(TEST_SUITE);
});

afterAll(async () => {
  await db?.destroy();
  await teardownConnection(TEST_SUITE);
});

beforeEach(async () => {
  jest.resetModules();
  jest.resetAllMocks();
  jest.restoreAllMocks();
  EventDispatcher.prototype.dispatchEventAsync = jest.fn().mockResolvedValue({ success: true });
  await App.clear();
  await User.clear();
});

describe('ListAppsInfos', () => {
  let app1: AppInfo;

  beforeEach(async () => {
    const { MockFiles, appInfo } = await createApp({});
    app1 = appInfo;
    // @ts-ignore
    fs.__createMockFiles(MockFiles);
  });

  it('Can list apps', async () => {
    const { data } = await gcall<{ listAppsInfo: ListAppsResonse }>({ source: listAppInfosQuery });

    expect(data?.listAppsInfo.apps.length).toBe(1);
    expect(data?.listAppsInfo.total).toBe(1);

    const app = data?.listAppsInfo.apps[0];

    expect(app?.id).toBe(app1.id);
    expect(app?.author).toBe(app1.author);
    expect(app?.name).toBe(app1.name);
    expect(app?.available).toBe(app1.available);
  });
});

describe('GetApp', () => {
  let app1: AppInfo;
  let app2: AppInfo;

  beforeEach(async () => {
    const app1create = await createApp({});
    const app2create = await createApp({ installed: true });
    app1 = app1create.appInfo;
    app2 = app2create.appInfo;
    // @ts-ignore
    fs.__createMockFiles(Object.assign(app1create.MockFiles, app2create.MockFiles));
  });

  it('Can get app', async () => {
    const { data } = await gcall<{ getApp: TApp }>({
      source: getAppQuery,
      variableValues: { id: app1.id },
    });

    expect(data?.getApp.info.id).toBe(app1.id);
    expect(data?.getApp.status).toBe(AppStatusEnum.MISSING.toUpperCase());

    const { data: data2 } = await gcall<{ getApp: TApp }>({
      source: getAppQuery,
      variableValues: { id: app2.id },
    });

    expect(data2?.getApp.info.id).toBe(app2.id);
  });

  it("Should return null info if app doesn't exist", async () => {
    const { data } = await gcall<{ getApp: TApp }>({
      source: getAppQuery,
      variableValues: { id: 'not-existing' },
    });

    expect(data?.getApp.info).toBeNull();
    expect(data?.getApp.status).toBe(AppStatusEnum.MISSING.toUpperCase());
  });
});

describe('InstalledApps', () => {
  let app1: AppInfo;

  beforeEach(async () => {
    const app1create = await createApp({ installed: true });
    app1 = app1create.appInfo;
    // @ts-ignore
    fs.__createMockFiles(app1create.MockFiles);
  });

  it('Can list installed apps', async () => {
    const user = await createUser();

    const { data } = await gcall<{ installedApps: TApp[] }>({ source: InstalledAppsQuery, userId: user.id });

    expect(data?.installedApps.length).toBe(1);

    const app = data?.installedApps[0];

    expect(app?.id).toBe(app1.id);
    expect(app?.info.author).toBe(app1.author);
    expect(app?.info.name).toBe(app1.name);
  });

  it("Should return an error if user doesn't exist", async () => {
    const { data, errors } = await gcall<{ installedApps: TApp[] }>({
      source: InstalledAppsQuery,
      userId: 1,
    });

    expect(errors?.[0].message).toBe('Access denied! You need to be authorized to perform this action!');
    expect(data?.installedApps).toBeUndefined();
  });

  it('Should throw an error if no userId is provided', async () => {
    const { data, errors } = await gcall<{ installedApps: TApp[] }>({
      source: InstalledAppsQuery,
    });

    expect(errors?.[0].message).toBe('Access denied! You need to be authorized to perform this action!');
    expect(data?.installedApps).toBeUndefined();
  });
});

describe('InstallApp', () => {
  let app1: AppInfo;

  beforeEach(async () => {
    const app1create = await createApp({});
    app1 = app1create.appInfo;
    // @ts-ignore
    fs.__createMockFiles(app1create.MockFiles);
  });

  it('Can install app', async () => {
    const user = await createUser();

    const { data } = await gcall<{ installApp: TApp }>({
      source: installAppMutation,
      userId: user.id,
      variableValues: { input: { id: app1.id, form: { TEST_FIELD: 'hello' }, exposed: false, domain: '' } },
    });

    expect(data?.installApp.info.id).toBe(app1.id);
    expect(data?.installApp.status).toBe(AppStatusEnum.RUNNING.toUpperCase());
  });

  it("Should return an error if app doesn't exist", async () => {
    const user = await createUser();

    const { data, errors } = await gcall<{ installApp: TApp }>({
      source: installAppMutation,
      userId: user.id,
      variableValues: { input: { id: 'not-existing', form: { TEST_FIELD: 'hello' }, exposed: false, domain: '' } },
    });

    expect(errors?.[0].message).toBe('App not-existing has invalid config.json file');
    expect(data?.installApp).toBeUndefined();
  });

  it("Should throw an error if user doesn't exist", async () => {
    const { data, errors } = await gcall<{ installApp: TApp }>({
      source: installAppMutation,
      variableValues: { input: { id: app1.id, form: { TEST_FIELD: 'hello' }, exposed: false, domain: '' } },
    });

    expect(errors?.[0].message).toBe('Access denied! You need to be authorized to perform this action!');
    expect(data?.installApp).toBeUndefined();
  });

  it('Should throw an error if no userId is provided', async () => {
    const { data, errors } = await gcall<{ installApp: TApp }>({
      source: installAppMutation,
      variableValues: { input: { id: app1.id, form: { TEST_FIELD: 'hello' }, exposed: false, domain: '' } },
    });

    expect(errors?.[0].message).toBe('Access denied! You need to be authorized to perform this action!');
    expect(data?.installApp).toBeUndefined();
  });

  it('Should throw an error if a required field is missing in form', async () => {
    const user = await createUser();

    const { data, errors } = await gcall<{ installApp: TApp }>({
      source: installAppMutation,
      userId: user.id,
      variableValues: { input: { id: app1.id, form: {}, exposed: false, domain: '' } },
    });

    expect(errors?.[0].message).toBe(`Variable ${app1.form_fields?.[0].env_variable} is required`);
    expect(data?.installApp).toBeUndefined();
  });
});

describe('StartApp', () => {
  let app1: AppInfo;

  beforeEach(async () => {
    const app1create = await createApp({ status: AppStatusEnum.STOPPED, installed: true });
    app1 = app1create.appInfo;
    // @ts-ignore
    fs.__createMockFiles(app1create.MockFiles);
  });

  it('Can start app', async () => {
    const user = await createUser();

    const { data } = await gcall<{ startApp: TApp }>({
      source: startAppMutation,
      userId: user.id,
      variableValues: { id: app1.id },
    });

    expect(data?.startApp.info.id).toBe(app1.id);
    expect(data?.startApp.status).toBe(AppStatusEnum.RUNNING.toUpperCase());
  });

  it("Should return an error if app doesn't exist", async () => {
    const user = await createUser();

    const { data, errors } = await gcall<{ startApp: TApp }>({
      source: startAppMutation,
      userId: user.id,
      variableValues: { id: 'not-existing' },
    });

    expect(errors?.[0].message).toBe('App not-existing not found');
    expect(data?.startApp).toBeUndefined();
  });

  it("Should throw an error if user doesn't exist", async () => {
    const { data, errors } = await gcall<{ startApp: TApp }>({
      source: startAppMutation,
      userId: 0,
      variableValues: { id: app1.id },
    });

    expect(errors?.[0].message).toBe('Access denied! You need to be authorized to perform this action!');
    expect(data?.startApp).toBeUndefined();
  });

  it('Should throw an error if no userId is provided', async () => {
    const { data, errors } = await gcall<{ startApp: TApp }>({
      source: startAppMutation,
      variableValues: { id: app1.id },
    });

    expect(errors?.[0].message).toBe('Access denied! You need to be authorized to perform this action!');
    expect(data?.startApp).toBeUndefined();
  });
});

describe('StopApp', () => {
  let app1: AppInfo;

  beforeEach(async () => {
    const app1create = await createApp({ status: AppStatusEnum.RUNNING, installed: true });
    app1 = app1create.appInfo;
    // @ts-ignore
    fs.__createMockFiles(app1create.MockFiles);
  });

  it('Can stop app', async () => {
    const user = await createUser();

    const { data } = await gcall<{ stopApp: TApp }>({
      source: stopAppMutation,
      userId: user.id,
      variableValues: { id: app1.id },
    });

    expect(data?.stopApp.info.id).toBe(app1.id);
    expect(data?.stopApp.status).toBe(AppStatusEnum.STOPPED.toUpperCase());
  });

  it("Should return an error if app doesn't exist", async () => {
    const user = await createUser();

    const { data, errors } = await gcall<{ stopApp: TApp }>({
      source: stopAppMutation,
      userId: user.id,
      variableValues: { id: 'not-existing' },
    });

    expect(errors?.[0].message).toBe('App not-existing not found');
    expect(data?.stopApp).toBeUndefined();
  });

  it("Should throw an error if user doesn't exist", async () => {
    const { data, errors } = await gcall<{ stopApp: TApp }>({
      source: stopAppMutation,
      userId: 0,
      variableValues: { id: app1.id },
    });

    expect(errors?.[0].message).toBe('Access denied! You need to be authorized to perform this action!');
    expect(data?.stopApp).toBeUndefined();
  });

  it('Should throw an error if no userId is provided', async () => {
    const { data, errors } = await gcall<{ stopApp: TApp }>({
      source: stopAppMutation,
      variableValues: { id: app1.id },
    });

    expect(errors?.[0].message).toBe('Access denied! You need to be authorized to perform this action!');
    expect(data?.stopApp).toBeUndefined();
  });
});

describe('UninstallApp', () => {
  let app1: AppInfo;

  beforeEach(async () => {
    const app1create = await createApp({ status: AppStatusEnum.STOPPED, installed: true });
    app1 = app1create.appInfo;
    // @ts-ignore
    fs.__createMockFiles(app1create.MockFiles);
  });

  it('Should uninstall app', async () => {
    const user = await createUser();

    const { data } = await gcall<{ uninstallApp: TApp }>({
      source: uninstallAppMutation,
      userId: user.id,
      variableValues: { id: app1.id },
    });

    expect(data?.uninstallApp.info.id).toBe(app1.id);
    expect(data?.uninstallApp.status).toBe(AppStatusEnum.MISSING.toUpperCase());
  });

  it("Should return an error if app doesn't exist", async () => {
    const user = await createUser();

    const { data, errors } = await gcall<{ uninstallApp: TApp }>({
      source: uninstallAppMutation,
      userId: user.id,
      variableValues: { id: 'not-existing' },
    });

    expect(errors?.[0].message).toBe('App not-existing not found');
    expect(data?.uninstallApp).toBeUndefined();
  });

  it("Should throw an error if user doesn't exist", async () => {
    const { data, errors } = await gcall<{ uninstallApp: TApp }>({
      source: uninstallAppMutation,
      userId: 0,
      variableValues: { id: app1.id },
    });

    expect(errors?.[0].message).toBe('Access denied! You need to be authorized to perform this action!');
    expect(data?.uninstallApp).toBeUndefined();
  });

  it('Should throw an error if no userId is provided', async () => {
    const { data, errors } = await gcall<{ uninstallApp: TApp }>({
      source: uninstallAppMutation,
      variableValues: { id: app1.id },
    });

    expect(errors?.[0].message).toBe('Access denied! You need to be authorized to perform this action!');
    expect(data?.uninstallApp).toBeUndefined();
  });
});

describe('UpdateAppConfig', () => {
  let app1: AppInfo;

  beforeEach(async () => {
    const app1create = await createApp({ status: AppStatusEnum.STOPPED, installed: true });
    app1 = app1create.appInfo;
    // @ts-ignore
    fs.__createMockFiles(app1create.MockFiles);
  });

  it('Should update app config', async () => {
    const user = await createUser();

    const word = faker.random.word();

    const { data } = await gcall<{ updateAppConfig: TApp }>({
      source: updateAppConfigMutation,
      userId: user.id,
      variableValues: { input: { id: app1.id, form: { TEST_FIELD: word }, exposed: false, domain: '' } },
    });

    expect(data?.updateAppConfig.info.id).toBe(app1.id);
    expect(data?.updateAppConfig.config.TEST_FIELD).toBe(word);
  });

  it("Should return an error if app doesn't exist", async () => {
    const user = await createUser();

    const { data, errors } = await gcall<{ updateAppConfig: TApp }>({
      source: updateAppConfigMutation,
      userId: user.id,
      variableValues: { input: { id: 'not-existing', form: { TEST_FIELD: faker.random.word() }, exposed: false, domain: '' } },
    });

    expect(errors?.[0].message).toBe('App not-existing not found');
    expect(data?.updateAppConfig).toBeUndefined();
  });

  it("Should throw an error if user doesn't exist", async () => {
    const { data, errors } = await gcall<{ updateAppConfig: TApp }>({
      source: updateAppConfigMutation,
      userId: 0,
      variableValues: { input: { id: app1.id, form: { TEST_FIELD: faker.random.word() }, exposed: false, domain: '' } },
    });

    expect(errors?.[0].message).toBe('Access denied! You need to be authorized to perform this action!');
    expect(data?.updateAppConfig).toBeUndefined();
  });

  it('Should throw an error if no userId is provided', async () => {
    const { data, errors } = await gcall<{ updateAppConfig: TApp }>({
      source: updateAppConfigMutation,
      variableValues: { input: { id: app1.id, form: { TEST_FIELD: faker.random.word() }, exposed: false, domain: '' } },
    });

    expect(errors?.[0].message).toBe('Access denied! You need to be authorized to perform this action!');
    expect(data?.updateAppConfig).toBeUndefined();
  });
});

describe('UpdateApp', () => {
  let app1: AppInfo;

  beforeEach(async () => {
    const app1create = await createApp({ status: AppStatusEnum.STOPPED, installed: true });
    app1 = app1create.appInfo;
    // @ts-ignore
    fs.__createMockFiles(app1create.MockFiles);
  });

  it('Should update app', async () => {
    const user = await createUser();

    const { data } = await gcall<{ updateApp: TApp }>({
      source: updateAppMutation,
      userId: user.id,
      variableValues: { id: app1.id },
    });

    expect(data?.updateApp.info.id).toBe(app1.id);
    expect(data?.updateApp.info.name).toBe(data?.updateApp.info.name);
  });

  it("Should return an error if app doesn't exist", async () => {
    const user = await createUser();

    const { data, errors } = await gcall<{ updateApp: TApp }>({
      source: updateAppMutation,
      userId: user.id,
      variableValues: { id: 'not-existing' },
    });

    expect(errors?.[0].message).toBe('App not-existing not found');
    expect(data?.updateApp).toBeUndefined();
  });

  it("Should throw an error if user doesn't exist", async () => {
    const { data, errors } = await gcall<{ updateApp: TApp }>({
      source: updateAppMutation,
      userId: 0,
      variableValues: { id: app1.id },
    });

    expect(errors?.[0].message).toBe('Access denied! You need to be authorized to perform this action!');
    expect(data?.updateApp).toBeUndefined();
  });

  it('Should throw an error if no userId is provided', async () => {
    const { data, errors } = await gcall<{ updateApp: TApp }>({
      source: updateAppMutation,
      variableValues: { id: app1.id },
    });

    expect(errors?.[0].message).toBe('Access denied! You need to be authorized to perform this action!');
    expect(data?.updateApp).toBeUndefined();
  });
});
