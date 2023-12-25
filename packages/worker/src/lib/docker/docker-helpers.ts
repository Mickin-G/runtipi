import path from 'path';
import { execAsync, pathExists } from '@runtipi/shared';
import { logger } from '@/lib/logger';
import { getEnv } from '@/lib/environment';
import { ROOT_FOLDER, STORAGE_FOLDER } from '@/config/constants';

const composeUp = async (args: string[]) => {
  logger.info(`Running docker compose with args ${args.join(' ')}`);
  const { stdout, stderr } = await execAsync(`docker-compose ${args.join(' ')}`);

  if (stderr && stderr.includes('Command failed:')) {
    throw new Error(stderr);
  }

  return { stdout, stderr };
};

/**
 * Helpers to execute docker compose commands
 * @param {string} appId - App name
 * @param {string} command - Command to execute
 */
export const compose = async (appId: string, command: string) => {
  const { arch, appsRepoId } = getEnv();
  const appDataDirPath = path.join(STORAGE_FOLDER, 'app-data', appId);
  const appDirPath = path.join(ROOT_FOLDER, 'apps', appId);

  const args: string[] = [`--env-file ${path.join(appDataDirPath, 'app.env')}`];

  // User custom env file
  const userEnvFile = path.join(ROOT_FOLDER, 'user-config', appId, 'app.env');
  if (await pathExists(userEnvFile)) {
    args.push(`--env-file ${userEnvFile}`);
  }

  args.push(`--project-name ${appId}`);

  let composeFile = path.join(appDirPath, 'docker-compose.yml');
  if (arch === 'arm64' && (await pathExists(path.join(appDirPath, 'docker-compose.arm64.yml')))) {
    composeFile = path.join(appDirPath, 'docker-compose.arm64.yml');
  }
  args.push(`-f ${composeFile}`);

  const commonComposeFile = path.join(ROOT_FOLDER, 'repos', appsRepoId, 'apps', 'docker-compose.common.yml');
  args.push(`-f ${commonComposeFile}`);

  // User defined overrides
  const userComposeFile = path.join(ROOT_FOLDER, 'user-config', appId, 'docker-compose.yml');
  if (await pathExists(userComposeFile)) {
    args.push(`--file ${userComposeFile}`);
  }

  args.push(command);

  return composeUp(args);
};
