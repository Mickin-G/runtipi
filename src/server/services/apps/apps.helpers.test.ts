import fs from 'fs-extra';
import { fromAny } from '@total-typescript/shoehorn';
import { App, PrismaClient } from '@prisma/client';
import { faker } from '@faker-js/faker';
import { setConfig } from '../../core/TipiConfig';
import { AppInfo, appInfoSchema, checkAppRequirements, checkEnvFile, ensureAppFolder, generateEnvFile, getAppInfo, getAvailableApps, getEnvMap, getUpdateInfo } from './apps.helpers';
import { createApp, createAppConfig } from '../../tests/apps.factory';
import { Logger } from '../../core/Logger';
import { getTestDbClient } from '../../../../tests/server/db-connection';

let db: PrismaClient;
const TEST_SUITE = 'appshelpers';

beforeAll(async () => {
  db = await getTestDbClient(TEST_SUITE);
});

beforeEach(async () => {
  jest.mock('fs-extra');
});

afterEach(async () => {
  await db.app.deleteMany();
});

afterAll(async () => {
  await db.app.deleteMany();
  await db.$disconnect();
});

describe('checkAppRequirements', () => {
  let app1: AppInfo;

  beforeEach(async () => {
    const app1create = await createApp({}, db);
    app1 = app1create.appInfo;
    // @ts-expect-error - Mocking fs
    fs.__createMockFiles(app1create.MockFiles);
  });

  it('should return appInfo if there are no particular requirement', async () => {
    const result = checkAppRequirements(app1.id);
    expect(result.id).toEqual(app1.id);
  });

  it('Should throw an error if app does not exist', async () => {
    try {
      checkAppRequirements('notexisting');
      expect(true).toBe(false);
    } catch (e) {
      // @ts-expect-error - Mocking fs
      expect(e.message).toEqual('App notexisting has invalid config.json file');
    }
  });

  it('Should throw if architecture is not supported', async () => {
    setConfig('architecture', 'arm64');
    const { MockFiles, appInfo } = await createApp({ supportedArchitectures: ['arm'] }, db);
    // @ts-expect-error - Mocking fs
    fs.__createMockFiles(MockFiles);

    try {
      checkAppRequirements(appInfo.id);
      expect(true).toBe(false);
    } catch (e) {
      // @ts-expect-error - Test file
      expect(e.message).toEqual(`App ${appInfo.id} is not supported on this architecture`);
    }
  });
});

describe('getEnvMap', () => {
  let app1: AppInfo;

  beforeEach(async () => {
    const app1create = await createApp({ installed: true }, db);
    app1 = app1create.appInfo;
    // @ts-expect-error - Mocking fs
    fs.__createMockFiles(app1create.MockFiles);
  });

  it('should return a map of env vars', async () => {
    const envMap = getEnvMap(app1.id);

    expect(envMap.get('TEST_FIELD')).toBe('test');
  });
});

describe('Test: checkEnvFile', () => {
  let app1: AppInfo;

  beforeEach(async () => {
    const app1create = await createApp({ installed: true }, db);
    app1 = app1create.appInfo;
    // @ts-expect-error - Mocking fs
    fs.__createMockFiles(app1create.MockFiles);
  });

  it('Should not throw if all required fields are present', async () => {
    checkEnvFile(app1.id);
  });

  it('Should throw if a required field is missing', () => {
    const newAppEnv = 'APP_PORT=test\n';
    fs.writeFileSync(`/app/storage/app-data/${app1.id}/app.env`, newAppEnv);

    try {
      checkEnvFile(app1.id);
      expect(true).toBe(false);
    } catch (e: unknown) {
      if (e instanceof Error) {
        expect(e).toBeDefined();
        expect(e.message).toBe('New info needed. App config needs to be updated');
      } else {
        expect(true).toBe(false);
      }
    }
  });

  it('Should throw if config.json is incorrect', async () => {
    // arrange
    fs.writeFileSync(`/app/storage/app-data/${app1.id}/config.json`, 'invalid json');
    const { appInfo } = await createApp({}, db);

    // act
    try {
      checkEnvFile(appInfo.id);
      expect(true).toBe(false);
    } catch (e: unknown) {
      if (e instanceof Error) {
        expect(e).toBeDefined();
        expect(e.message).toBe(`App ${appInfo.id} has invalid config.json file`);
      } else {
        expect(true).toBe(false);
      }
    }
  });
});

describe('Test: appInfoSchema', () => {
  it('should default form_field type to text if it is wrong', async () => {
    // arrange
    const config = createAppConfig(fromAny({ form_fields: [{ env_variable: 'test', type: 'wrong', label: 'yo', required: true }] }));
    fs.writeFileSync(`/app/storage/app-data/${config.id}/config.json`, JSON.stringify(config));

    // act
    const appInfo = appInfoSchema.safeParse(config);

    // assert
    expect(appInfo.success).toBe(true);
    if (appInfo.success) {
      expect(appInfo.data.form_fields[0]?.type).toBe('text');
    } else {
      expect(true).toBe(false);
    }
  });

  it('should default categories to ["utilities"] if it is wrong', async () => {
    // arrange
    const config = createAppConfig(fromAny({ categories: 'wrong' }));
    fs.writeFileSync(`/app/storage/app-data/${config.id}/config.json`, JSON.stringify(config));

    // act
    const appInfo = appInfoSchema.safeParse(config);

    // assert
    expect(appInfo.success).toBe(true);
    if (appInfo.success) {
      expect(appInfo.data.categories).toStrictEqual(['utilities']);
    } else {
      expect(true).toBe(false);
    }
  });
});
describe('Test: generateEnvFile', () => {
  let app1: AppInfo;
  let appEntity1: App;
  beforeEach(async () => {
    const app1create = await createApp({ installed: true }, db);
    app1 = app1create.appInfo;
    appEntity1 = app1create.appEntity;
    // @ts-expect-error - Mocking fs
    fs.__createMockFiles(app1create.MockFiles);
  });

  it('Should generate an env file', async () => {
    const fakevalue = faker.random.alphaNumeric(10);

    generateEnvFile(Object.assign(appEntity1, { config: { TEST_FIELD: fakevalue } }));

    const envmap = getEnvMap(app1.id);

    expect(envmap.get('TEST_FIELD')).toBe(fakevalue);
  });

  it('Should automatically generate value for random field', async () => {
    const { appEntity, appInfo, MockFiles } = await createApp({ installed: true, randomField: true }, db);
    // @ts-expect-error - Mocking fs
    fs.__createMockFiles(MockFiles);

    generateEnvFile(appEntity);

    const envmap = getEnvMap(appInfo.id);

    expect(envmap.get('RANDOM_FIELD')).toBeDefined();
    expect(envmap.get('RANDOM_FIELD')).toHaveLength(32);
  });

  it('Should not re-generate random field if it already exists', async () => {
    const { appEntity, appInfo, MockFiles } = await createApp({ installed: true, randomField: true }, db);
    // @ts-expect-error - Mocking fs
    fs.__createMockFiles(MockFiles);

    const randomField = faker.random.alphaNumeric(32);

    fs.writeFileSync(`/app/storage/app-data/${appInfo.id}/app.env`, `RANDOM_FIELD=${randomField}`);

    generateEnvFile(appEntity);

    const envmap = getEnvMap(appInfo.id);

    expect(envmap.get('RANDOM_FIELD')).toBe(randomField);
  });

  it('Should throw an error if required field is not provided', async () => {
    try {
      generateEnvFile(Object.assign(appEntity1, { config: { TEST_FIELD: undefined } }));
      expect(true).toBe(false);
    } catch (e: unknown) {
      if (e instanceof Error) {
        expect(e).toBeDefined();
        expect(e.message).toBe('Variable TEST_FIELD is required');
      } else {
        expect(true).toBe(false);
      }
    }
  });

  it('Should throw an error if app does not exist', async () => {
    try {
      generateEnvFile(Object.assign(appEntity1, { id: 'not-existing-app' }));
      expect(true).toBe(false);
    } catch (e: unknown) {
      if (e instanceof Error) {
        expect(e).toBeDefined();
        expect(e.message).toBe('App not-existing-app has invalid config.json file');
      } else {
        expect(true).toBe(false);
      }
    }
  });

  it('Should add APP_EXPOSED to env file', async () => {
    const domain = faker.internet.domainName();
    const { appEntity, appInfo, MockFiles } = await createApp({ installed: true, exposed: true, domain }, db);
    // @ts-expect-error - Mocking fs
    fs.__createMockFiles(MockFiles);

    generateEnvFile(appEntity);

    const envmap = getEnvMap(appInfo.id);

    expect(envmap.get('APP_EXPOSED')).toBe('true');
    expect(envmap.get('APP_DOMAIN')).toBe(domain);
  });

  it('Should not add APP_EXPOSED if domain is not provided', async () => {
    const { appEntity, appInfo, MockFiles } = await createApp({ installed: true, exposed: true }, db);
    // @ts-expect-error - Mocking fs
    fs.__createMockFiles(MockFiles);

    generateEnvFile(appEntity);

    const envmap = getEnvMap(appInfo.id);

    expect(envmap.get('APP_EXPOSED')).toBeUndefined();
  });

  it('Should not add APP_EXPOSED if app is not exposed', async () => {
    const { appEntity, appInfo, MockFiles } = await createApp({ installed: true, domain: faker.internet.domainName() }, db);
    // @ts-expect-error - Mocking fs
    fs.__createMockFiles(MockFiles);

    generateEnvFile(appEntity);

    const envmap = getEnvMap(appInfo.id);

    expect(envmap.get('APP_EXPOSED')).toBeUndefined();
    expect(envmap.get('APP_DOMAIN')).toBe(`localhost:${appInfo.port}`);
  });

  it('Should create app folder if it does not exist', async () => {
    const { appEntity, appInfo, MockFiles } = await createApp({ installed: true }, db);
    // @ts-expect-error - Mocking fs
    fs.__createMockFiles(MockFiles);

    fs.rmSync(`/app/storage/app-data/${appInfo.id}`, { recursive: true });

    generateEnvFile(appEntity);

    expect(fs.existsSync(`/app/storage/app-data/${appInfo.id}`)).toBe(true);
  });
});

describe('getAvailableApps', () => {
  beforeEach(async () => {
    const app1create = await createApp({ installed: true }, db);
    const app2create = await createApp({}, db);
    // @ts-expect-error - Mocking fs
    fs.__createMockFiles(Object.assign(app1create.MockFiles, app2create.MockFiles));
  });

  it('Should return all available apps', async () => {
    const availableApps = await getAvailableApps();

    expect(availableApps.length).toBe(2);
  });

  it('Should not return apps with invalid config.json', async () => {
    const { appInfo: app1, MockFiles: MockFiles1 } = await createApp({ installed: true }, db);
    const { MockFiles: MockFiles2 } = await createApp({}, db);
    MockFiles1[`/runtipi/repos/repo-id/apps/${app1.id}/config.json`] = 'invalid json';
    // @ts-expect-error - Mocking fs
    fs.__createMockFiles(Object.assign(MockFiles1, MockFiles2));

    const availableApps = await getAvailableApps();

    expect(availableApps.length).toBe(1);
  });
});

describe('Test: getAppInfo', () => {
  let app1: AppInfo;
  beforeEach(async () => {
    const app1create = await createApp({ installed: false }, db);
    app1 = app1create.appInfo;
    // @ts-expect-error - Mocking fs
    fs.__createMockFiles(app1create.MockFiles);
  });

  it('Should return app info', async () => {
    const appInfo = getAppInfo(app1.id);

    expect(appInfo?.id).toBe(app1.id);
  });

  it('Should take config.json locally if app is installed', async () => {
    const { appInfo, MockFiles, appEntity } = await createApp({ installed: true }, db);
    // @ts-expect-error - Mocking fs
    fs.__createMockFiles(MockFiles);

    const newConfig = createAppConfig();

    fs.writeFileSync(`/runtipi/apps/${appInfo.id}/config.json`, JSON.stringify(newConfig));

    const app = getAppInfo(appInfo.id, appEntity.status);

    expect(app?.id).toEqual(newConfig.id);
  });

  it('Should take config.json from repo if app is not installed', async () => {
    const { appInfo, MockFiles, appEntity } = await createApp({ installed: false }, db);
    // @ts-expect-error - Mocking fs
    fs.__createMockFiles(MockFiles);

    const newConfig = createAppConfig();

    fs.writeFileSync(`/runtipi/repos/repo-id/apps/${appInfo.id}/config.json`, JSON.stringify(newConfig));

    const app = getAppInfo(appInfo.id, appEntity.status);

    expect(app?.id).toEqual(newConfig.id);
  });

  it('Should return null if app is not available', async () => {
    const { appInfo, MockFiles, appEntity } = await createApp({ installed: false }, db);
    // @ts-expect-error - Mocking fs
    fs.__createMockFiles(MockFiles);

    const newConfig = {
      id: faker.random.alphaNumeric(32),
      available: false,
    };

    fs.writeFileSync(`/runtipi/repos/repo-id/apps/${appInfo.id}/config.json`, JSON.stringify(newConfig));

    const app = getAppInfo(appInfo.id, appEntity.status);

    expect(app).toBeNull();
  });

  it('Should throw if something goes wrong', async () => {
    const log = jest.spyOn(Logger, 'error');
    const spy = jest.spyOn(fs, 'existsSync').mockImplementation(() => {
      throw new Error('Something went wrong');
    });

    const { appInfo, MockFiles, appEntity } = await createApp({ installed: false }, db);
    // @ts-expect-error - Mocking fs
    fs.__createMockFiles(MockFiles);

    const newConfig = {
      id: faker.random.alphaNumeric(32),
      available: false,
    };

    fs.writeFileSync(`/runtipi/repos/repo-id/apps/${appInfo.id}/config.json`, JSON.stringify(newConfig));

    try {
      getAppInfo(appInfo.id, appEntity.status);
      expect(true).toBe(false);
    } catch (e: unknown) {
      if (e instanceof Error) {
        expect(e.message).toBe(`Error loading app: ${appInfo.id}`);
        expect(log).toBeCalledWith(`Error loading app: ${appInfo.id}`);
      } else {
        expect(true).toBe(false);
      }
    }

    spy.mockRestore();
    log.mockRestore();
  });

  it('Should return null if app does not exist', async () => {
    const app = getAppInfo(faker.random.word());

    expect(app).toBeNull();
  });
});

describe('getUpdateInfo', () => {
  let app1: AppInfo;
  beforeEach(async () => {
    const app1create = await createApp({ installed: true }, db);
    app1 = app1create.appInfo;
    // @ts-expect-error - Mocking fs
    fs.__createMockFiles(app1create.MockFiles);
  });

  it('Should return update info', async () => {
    const updateInfo = getUpdateInfo(app1.id);

    expect(updateInfo?.latestVersion).toBe(app1.tipi_version);
  });

  it('Should return default values if app is not installed', async () => {
    const updateInfo = getUpdateInfo(faker.random.word());

    expect(updateInfo).toEqual({ latestVersion: 0, latestDockerVersion: '0.0.0' });
  });

  it('Should return default values if config.json is invalid', async () => {
    const { appInfo, MockFiles } = await createApp({ installed: true }, db);
    MockFiles[`/runtipi/repos/repo-id/apps/${appInfo.id}/config.json`] = 'invalid json';
    // @ts-expect-error - Mocking fs
    fs.__createMockFiles(MockFiles);

    const updateInfo = getUpdateInfo(appInfo.id);

    expect(updateInfo).toEqual({ latestVersion: 0, latestDockerVersion: '0.0.0' });
  });
});

describe('Test: ensureAppFolder', () => {
  beforeEach(() => {
    const mockFiles = {
      [`/runtipi/repos/repo-id/apps/test`]: ['test.yml'],
    };
    // @ts-expect-error - Mocking fs
    fs.__createMockFiles(mockFiles);
  });

  it('should copy the folder from repo', () => {
    // Act
    ensureAppFolder('test');

    // Assert
    const files = fs.readdirSync('/runtipi/apps/test');
    expect(files).toEqual(['test.yml']);
  });

  it('should not copy the folder if it already exists', () => {
    const mockFiles = {
      [`/runtipi/repos/repo-id/apps/test`]: ['test.yml'],
      '/runtipi/apps/test': ['docker-compose.yml'],
      '/runtipi/apps/test/docker-compose.yml': 'test',
    };

    // @ts-expect-error - Mocking fs
    fs.__createMockFiles(mockFiles);

    // Act
    ensureAppFolder('test');

    // Assert
    const files = fs.readdirSync('/runtipi/apps/test');
    expect(files).toEqual(['docker-compose.yml']);
  });

  it('Should overwrite the folder if clean up is true', () => {
    const mockFiles = {
      [`/runtipi/repos/repo-id/apps/test`]: ['test.yml'],
      '/runtipi/apps/test': ['docker-compose.yml'],
      '/runtipi/apps/test/docker-compose.yml': 'test',
    };

    // @ts-expect-error - Mocking fs
    fs.__createMockFiles(mockFiles);

    // Act
    ensureAppFolder('test', true);

    // Assert
    const files = fs.readdirSync('/runtipi/apps/test');
    expect(files).toEqual(['test.yml']);
  });

  it('Should delete folder if it exists but has no docker-compose.yml file', () => {
    // Arrange
    const randomFileName = `${faker.random.word()}.yml`;
    const mockFiles = {
      [`/runtipi/repos/repo-id/apps/test`]: [randomFileName],
      '/runtipi/apps/test': ['test.yml'],
    };

    // @ts-expect-error - Mocking fs
    fs.__createMockFiles(mockFiles);

    // Act
    ensureAppFolder('test');

    // Assert
    const files = fs.readdirSync('/runtipi/apps/test');
    expect(files).toEqual([randomFileName]);
  });
});
