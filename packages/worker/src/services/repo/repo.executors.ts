import path from 'path';
import { execAsync, pathExists } from '@runtipi/shared';
import * as Sentry from '@sentry/node';
import { getRepoHash, getRepoBaseUrlAndBranch } from './repo.helpers';
import { logger } from '@/lib/logger';

export class RepoExecutors {
  private readonly logger;

  constructor() {
    this.logger = logger;
  }

  /**
   * Error handler for repo operations
   * @param {unknown} err
   */
  private handleRepoError = (err: unknown) => {
    Sentry.captureException(err);

    if (err instanceof Error) {
      this.logger.error(`An error occurred: ${err.message}`);
      return { success: false, message: err.message };
    }

    return { success: false, message: `An error occurred: ${err}` };
  };

  /**
   * Given a repo url, clone it to the repos folder if it doesn't exist
   *
   * @param {string} url
   */
  public cloneRepo = async (url: string) => {
    try {
      // We may have a potential branch computed in the hash (see getRepoBaseUrlAndBranch)
      // so we do it here before splitting the url into repoUrl and branch
      const repoHash = getRepoHash(url);
      const repoPath = path.join('/app', 'repos', repoHash);

      if (await pathExists(repoPath)) {
        this.logger.info(`Repo ${url} already exists`);
        return { success: true, message: '' };
      }

      const [repoUrl, branch] = getRepoBaseUrlAndBranch(url);

      let cloneCommand;
      if (branch) {
        this.logger.info(`Cloning repo ${repoUrl} on branch ${branch} to ${repoPath}`);
        cloneCommand = `git clone -b ${branch} ${repoUrl} ${repoPath}`;
      } else {
        this.logger.info(`Cloning repo ${repoUrl} to ${repoPath}`);
        cloneCommand = `git clone ${repoUrl} ${repoPath}`;
      }

      await execAsync(cloneCommand);

      this.logger.info(`Cloned repo ${repoUrl} to ${repoPath}`);
      return { success: true, message: '' };
    } catch (err) {
      return this.handleRepoError(err);
    }
  };

  /**
   * Given a repo url, pull it to the repos folder if it exists
   *
   * @param {string} repoUrl
   */
  public pullRepo = async (repoUrl: string) => {
    try {
      const repoHash = getRepoHash(repoUrl);
      const repoPath = path.join('/app', 'repos', repoHash);

      if (!(await pathExists(repoPath))) {
        this.logger.info(`Repo ${repoUrl} does not exist`);
        return { success: false, message: `Repo ${repoUrl} does not exist` };
      }

      this.logger.info(`Pulling repo ${repoUrl} to ${repoPath}`);

      this.logger.info(`Executing: git config --global --add safe.directory ${repoPath}`);
      await execAsync(`git config --global --add safe.directory ${repoPath}`).then(({ stderr }) => {
        if (stderr) {
          this.logger.error(`stderr: ${stderr}`);
        }
      });

      // git config pull.rebase false
      this.logger.info(`Executing: git -C ${repoPath} config pull.rebase false`);
      await execAsync(`git -C ${repoPath} config pull.rebase false`).then(({ stderr }) => {
        if (stderr) {
          this.logger.error(`stderr: ${stderr}`);
        }
      });

      this.logger.info(`Executing: git -C ${repoPath} rev-parse --abbrev-ref HEAD`);
      const currentBranch = await execAsync(`git -C ${repoPath} rev-parse --abbrev-ref HEAD`).then(({ stdout }) => {
        return stdout.trim();
      });

      this.logger.info(`Executing: git -C ${repoPath} fetch origin && git -C ${repoPath} reset --hard origin/${currentBranch}`);
      await execAsync(`git -C ${repoPath} fetch origin && git -C ${repoPath} reset --hard origin/${currentBranch}`);

      this.logger.info(`Pulled repo ${repoUrl} to ${repoPath}`);
      return { success: true, message: '' };
    } catch (err) {
      return this.handleRepoError(err);
    }
  };
}
