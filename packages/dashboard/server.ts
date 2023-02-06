/* eslint-disable consistent-return */
import express from 'express';
import { parse } from 'url';
import next from 'next';
import { EventDispatcher } from './src/server/core/EventDispatcher';
import { getConfig, setConfig } from './src/server/core/TipiConfig';
import { Logger } from './src/server/core/Logger';
import { runPostgresMigrations } from './run-migration';
import { AppServiceClass } from './src/server/services/apps/apps.service';
import { prisma } from './src/server/db/client';

const port = parseInt(process.env.PORT || '3000', 10);
const dev = process.env.NODE_ENV !== 'production';
const nextApp = next({ dev });
const handle = nextApp.getRequestHandler();

nextApp.prepare().then(async () => {
  const app = express();
  app.disable('x-powered-by');

  app.use('/static', express.static(`${getConfig().rootFolder}/repos/${getConfig().appsRepoId}/`));

  app.all('*', (req, res) => {
    const parsedUrl = parse(req.url!, true);

    handle(req, res, parsedUrl);
  });

  app.listen(port, async () => {
    const appService = new AppServiceClass(prisma);
    EventDispatcher.clear();

    // Run database migrations
    await runPostgresMigrations();

    // startJobs();
    setConfig('status', 'RUNNING');

    await EventDispatcher.dispatchEventAsync('clone_repo', [getConfig().appsRepoUrl]);
    await EventDispatcher.dispatchEventAsync('update_repo', [getConfig().appsRepoUrl]);

    appService.startAllApps();

    Logger.info(`> Server listening at http://localhost:${port} as ${dev ? 'development' : process.env.NODE_ENV}`);
  });
});
