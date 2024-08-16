import { promises } from "node:fs";
import { DATA_DIR } from "@/config/constants";
import type { ITipiCache } from "@/server/core/TipiCache/TipiCache";
import axios from "redaxios";
import { container } from "src/inversify.config";
import { fileExists } from "../../common/fs.helpers";
import { Logger } from "../../core/Logger";
import { TipiConfig } from "../../core/TipiConfig";
import path from "node:path";
import fs from "node:fs";
import { type RepoSchema, repoSchema } from "packages/shared/src";

export class SystemServiceClass {
  /**
   * Get the current and latest version of Tipi
   *
   * @returns {Promise<{ current: string; latest: string }>} The current and latest version
   */
  public getVersion = async () => {
    const tipiCache = container.get<ITipiCache>("ITipiCache");
    try {
      const { seePreReleaseVersions, version: currentVersion } =
        TipiConfig.getConfig();

      if (seePreReleaseVersions) {
        const { data } = await axios.get<{ tag_name: string; body: string }[]>(
          "https://api.github.com/repos/runtipi/runtipi/releases"
        );

        return {
          current: currentVersion,
          latest: data[0]?.tag_name ?? currentVersion,
          body: data[0]?.body,
        };
      }

      let version = await tipiCache.get("latestVersion");
      let body = await tipiCache.get("latestVersionBody");

      if (!version) {
        const { data } = await axios.get<{ tag_name: string; body: string }>(
          "https://api.github.com/repos/runtipi/runtipi/releases/latest"
        );

        version = data.tag_name;
        body = data.body;

        await tipiCache.set("latestVersion", version || "", 60 * 60);
        await tipiCache.set("latestVersionBody", body || "", 60 * 60);
      }

      return { current: TipiConfig.getConfig().version, latest: version, body };
    } catch (e) {
      Logger.error(e);
      return {
        current: TipiConfig.getConfig().version,
        latest: TipiConfig.getConfig().version,
        body: "",
      };
    }
  };

  public static hasSeenWelcome = async () => {
    return fileExists(`${DATA_DIR}/state/seen-welcome`);
  };

  public static markSeenWelcome = async () => {
    // Create file state/seen-welcome
    await promises.writeFile(`${DATA_DIR}/state/seen-welcome`, "");
    return true;
  };

  public static getRepositories = async () => {
    try {
      const appStoresFile = path.join(DATA_DIR, "state", "appstores.json");
      const appStoresRaw = await fs.promises.readFile(appStoresFile, "utf-8");
      const appStoresParsed = await repoSchema.safeParseAsync(
        JSON.parse(appStoresRaw)
      );
      if (appStoresParsed.success) {
        return appStoresParsed.data;
      }
      console.log(appStoresParsed.error);
      return [];
    } catch (e) {
      return [];
    }
  };

  public static writeRepositories = async (repositories: RepoSchema) => {
    try {
      const appStoresFile = path.join(DATA_DIR, "state", "appstores.json");
      await fs.promises.writeFile(appStoresFile, JSON.stringify(repositories));
      return { success: true, message: "" };
    } catch (e) {
      return { success: false, message: e };
    }
  };
}
