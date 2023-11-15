import fs from 'fs';
import { describe, it, expect, vi } from 'vitest';
import path from 'path';
import { faker } from '@faker-js/faker';
import { pathExists } from '@runtipi/shared';
import { AppExecutors } from '../app.executors';
import { createAppConfig } from '@/tests/apps.factory';
import * as dockerHelpers from '@/lib/docker';
import { getEnv } from '@/lib/environment';
import { ROOT_FOLDER, STORAGE_FOLDER } from '@/config/constants';

const { appsRepoId } = getEnv();

describe('test: app executors', () => {
  const appExecutors = new AppExecutors();

  describe('test: installApp()', () => {
    it('should run correct compose script', async () => {
      // arrange
      const spy = vi.spyOn(dockerHelpers, 'compose').mockImplementation(() => Promise.resolve({ stdout: 'done', stderr: '' }));
      const config = createAppConfig({}, false);

      // act
      const { message, success } = await appExecutors.installApp(config.id, config);

      // assert
      const envExists = await pathExists(path.join(STORAGE_FOLDER, 'app-data', config.id, 'app.env'));

      expect(success).toBe(true);
      expect(message).toBe(`App ${config.id} installed successfully`);
      expect(spy).toHaveBeenCalledWith(config.id, 'up -d');
      expect(envExists).toBe(true);
      spy.mockRestore();
    });

    it('should return error if compose script fails', async () => {
      // arrange
      const randomError = faker.system.fileName();
      const spy = vi.spyOn(dockerHelpers, 'compose').mockImplementation(() => {
        throw new Error(randomError);
      });
      const config = createAppConfig({}, false);

      // act
      const { message, success } = await appExecutors.installApp(config.id, config);

      // assert
      expect(success).toBe(false);
      expect(message).toContain(randomError);
      spy.mockRestore();
    });

    it('should delete existing app folder', async () => {
      // arrange
      const config = createAppConfig();
      await fs.promises.mkdir(path.join(ROOT_FOLDER, 'apps', config.id), { recursive: true });
      await fs.promises.writeFile(path.join(ROOT_FOLDER, 'apps', config.id, 'test.txt'), 'test');

      // act
      await appExecutors.installApp(config.id, config);

      // assert
      const exists = await pathExists(path.join(STORAGE_FOLDER, 'apps', config.id, 'test.txt'));

      expect(exists).toBe(false);
    });

    it('should not delete existing app-data folder', async () => {
      // arrange
      const config = createAppConfig();
      const filename = faker.system.fileName();
      await fs.promises.writeFile(path.join(STORAGE_FOLDER, 'app-data', config.id, filename), 'test');

      // act
      await appExecutors.installApp(config.id, config);

      // assert
      const exists = await pathExists(path.join(STORAGE_FOLDER, 'app-data', config.id, filename));

      expect(exists).toBe(true);
    });

    it('should copy data folder from repo to app-data/id/data', async () => {
      // arrange
      const config = createAppConfig({}, false);
      const filename = faker.system.fileName();
      await fs.promises.mkdir(path.join(ROOT_FOLDER, 'repos', appsRepoId, 'apps', config.id, 'data'), { recursive: true });
      await fs.promises.writeFile(path.join(ROOT_FOLDER, 'repos', appsRepoId, 'apps', config.id, 'data', filename), 'test');

      // act
      await appExecutors.installApp(config.id, config);

      // assert
      const exists = await pathExists(path.join(STORAGE_FOLDER, 'app-data', config.id, 'data', filename));
      const data = await fs.promises.readFile(path.join(STORAGE_FOLDER, 'app-data', config.id, 'data', filename), 'utf-8');

      expect(exists).toBe(true);
      expect(data).toBe('test');
    });

    it('should not overwrite exisiting app-data/id/data folder if repo has one', async () => {
      // arrange
      const config = createAppConfig();
      const filename = faker.system.fileName();
      await fs.promises.writeFile(path.join(STORAGE_FOLDER, 'app-data', config.id, 'data', filename), 'test');
      await fs.promises.mkdir(path.join(ROOT_FOLDER, 'repos', appsRepoId, 'apps', config.id, 'data'), { recursive: true });
      await fs.promises.writeFile(path.join(ROOT_FOLDER, 'repos', appsRepoId, 'apps', config.id, 'data', filename), 'yeah');

      // act
      await appExecutors.installApp(config.id, config);

      // assert
      const exists = await pathExists(path.join(STORAGE_FOLDER, 'app-data', config.id, 'data', filename));
      const data = await fs.promises.readFile(path.join(STORAGE_FOLDER, 'app-data', config.id, 'data', filename), 'utf-8');

      expect(exists).toBe(true);
      expect(data).toBe('test');
    });

    it('should handle errors gracefully', async () => {
      // arrange
      const spy = vi.spyOn(dockerHelpers, 'compose').mockImplementation(() => Promise.reject(new Error('test')));
      const config = createAppConfig();

      // act
      const { message, success } = await appExecutors.installApp(config.id, config);

      // assert
      expect(success).toBe(false);
      expect(message).toBe('test');
      spy.mockRestore();
    });

    it('should error if app does not exist', async () => {
      // act
      const { message, success } = await appExecutors.installApp('inexistant', {});

      // assert
      expect(success).toBe(false);
      expect(message).toBe(`App inexistant not found in repo ${appsRepoId}`);
    });
  });

  describe('test: stopApp()', () => {
    it('should run correct compose script', async () => {
      // arrange
      const spy = vi.spyOn(dockerHelpers, 'compose').mockImplementation(() => Promise.resolve({ stdout: 'done', stderr: '' }));
      const config = createAppConfig();

      // act
      const { message, success } = await appExecutors.stopApp(config.id, {}, true);

      // assert
      expect(success).toBe(true);
      expect(message).toBe(`App ${config.id} stopped successfully`);
      expect(spy).toHaveBeenCalledWith(config.id, 'rm --force --stop');
      spy.mockRestore();
    });

    // it('should re-genereate app.env file', async () => {
    //   // arrange
    //   const config = createAppConfig();
    // });

    it('should handle errors gracefully', async () => {
      // arrange
      const spy = vi.spyOn(dockerHelpers, 'compose').mockImplementation(() => Promise.reject(new Error('test')));
      const config = createAppConfig();

      // act
      const { message, success } = await appExecutors.stopApp(config.id, {}, true);

      // assert
      expect(success).toBe(false);
      expect(message).toBe('test');
      spy.mockRestore();
    });
  });
});
