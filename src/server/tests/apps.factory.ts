import { faker } from '@faker-js/faker';
import { eq } from 'drizzle-orm';
import { Architecture } from '../core/TipiConfig/TipiConfig';
import { AppInfo, appInfoSchema } from '../services/apps/apps.helpers';
import { APP_CATEGORIES } from '../services/apps/apps.types';
import { TestDatabase } from './test-utils';
import { appTable, AppStatus, App } from '../db/schema';

interface IProps {
  installed?: boolean;
  status?: AppStatus;
  requiredPort?: number;
  randomField?: boolean;
  exposed?: boolean;
  domain?: string;
  exposable?: boolean;
  forceExpose?: boolean;
  generateVapidKeys?: boolean;
  supportedArchitectures?: Architecture[];
}

const createAppConfig = (props?: Partial<AppInfo>) =>
  appInfoSchema.parse({
    id: faker.random.alphaNumeric(32),
    available: true,
    port: faker.datatype.number({ min: 30, max: 65535 }),
    name: faker.random.alphaNumeric(32),
    description: faker.random.alphaNumeric(32),
    tipi_version: 1,
    short_desc: faker.random.alphaNumeric(32),
    author: faker.random.alphaNumeric(32),
    source: faker.internet.url(),
    categories: [APP_CATEGORIES.AUTOMATION],
    ...props,
  });

const createApp = async (props: IProps, database: TestDatabase) => {
  const {
    installed = false,
    status = 'running',
    randomField = false,
    exposed = false,
    domain = null,
    exposable = false,
    supportedArchitectures,
    forceExpose = false,
    generateVapidKeys = false,
  } = props;

  const categories = Object.values(APP_CATEGORIES);

  const randomId = faker.random.alphaNumeric(32);

  const appInfo: AppInfo = {
    id: randomId,
    port: faker.datatype.number({ min: 3000, max: 5000 }),
    available: true,
    form_fields: [
      {
        type: 'text',
        label: faker.random.word(),
        required: true,
        env_variable: 'TEST_FIELD',
      },
    ],
    name: faker.random.word(),
    description: faker.random.words(),
    tipi_version: faker.datatype.number({ min: 1, max: 10 }),
    short_desc: faker.random.words(),
    author: faker.name.firstName(),
    source: faker.internet.url(),
    categories: [categories[faker.datatype.number({ min: 0, max: categories.length - 1 })]] as AppInfo['categories'],
    exposable,
    force_expose: forceExpose,
    supported_architectures: supportedArchitectures,
    version: String(faker.datatype.number({ min: 1, max: 10 })),
    https: false,
    no_gui: false,
    generate_vapid_keys: generateVapidKeys,
  };

  if (randomField) {
    appInfo.form_fields?.push({
      required: false,
      type: 'random',
      label: faker.random.word(),
      env_variable: 'RANDOM_FIELD',
    });
  }

  const MockFiles: Record<string, string | string[]> = {};
  MockFiles['/runtipi/.env'] = 'TEST=test';
  MockFiles['/runtipi/repos/repo-id'] = '';
  MockFiles[`/runtipi/repos/repo-id/apps/${appInfo.id}/config.json`] = JSON.stringify(appInfoSchema.parse(appInfo));
  MockFiles[`/runtipi/repos/repo-id/apps/${appInfo.id}/docker-compose.yml`] = 'compose';
  MockFiles[`/runtipi/repos/repo-id/apps/${appInfo.id}/metadata/description.md`] = 'md desc';

  let appEntity: App = {} as App;
  if (installed) {
    const insertedApp = await database.db
      .insert(appTable)
      .values({
        id: appInfo.id,
        config: { TEST_FIELD: 'test' },
        status,
        exposed,
        domain,
        version: 1,
      })
      .returning();

    // eslint-disable-next-line prefer-destructuring
    appEntity = insertedApp[0] as App;

    MockFiles[`/app/storage/app-data/${appInfo.id}`] = '';
    MockFiles[`/app/storage/app-data/${appInfo.id}/app.env`] = 'TEST=test\nAPP_PORT=3000\nTEST_FIELD=test';
    MockFiles[`/runtipi/apps/${appInfo.id}/config.json`] = JSON.stringify(appInfo);
    MockFiles[`/runtipi/apps/${appInfo.id}/metadata/description.md`] = 'md desc';
  }

  return { appInfo, MockFiles, appEntity };
};

const getAppById = async (id: string, database: TestDatabase) => {
  const apps = await database.db.select().from(appTable).where(eq(appTable.id, id));
  return apps[0] || null;
};

const updateApp = async (id: string, props: Partial<App>, database: TestDatabase) => {
  await database.db.update(appTable).set(props).where(eq(appTable.id, id));
};

const getAllApps = async (database: TestDatabase) => {
  const apps = await database.db.select().from(appTable);
  return apps;
};

export { createApp, getAppById, updateApp, getAllApps, createAppConfig };
