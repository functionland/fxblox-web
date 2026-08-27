/**
 * Adapted from react-native-fula/src/protocols/fxblox.ts (1.58.x). Parsing / rejection quirks preserved
 * (see blockchain.ts); only the logging changed. Note the plugin functions' double-parse quirk: when
 * `status` is false the thrown object is caught by the outer `catch`, parsed again and RETURNED — so a
 * `{status:false,msg}` resolves rather than rejects. apps/box relies on that.
 */
import Fula from '../core/nativeShim.js';
import { createLogger } from '../core/log.js';
import type * as BType from '../types/fxblox.js';

const log = createLogger('fxblox');

/**
 * send a command to Blox hardware to remove all save wifis.
 * @returns json{status:true if success, false if fails; msg: error message or success log}
 */
export const wifiRemoveall = (): Promise<BType.wifiRemoveallResponse> => {
  log.debug('wifiRemoveall started');
  const res2 = Fula.wifiRemoveall()
    .then((res) => {
      try {
        const jsonRes: BType.wifiRemoveallResponse = JSON.parse(res);
        return jsonRes;
      } catch {
        try {
          return JSON.parse(res);
        } catch {
          return res;
        }
      }
    })
    .catch((err) => {
      return err;
    });
  return res2;
};

export const reboot = (): Promise<BType.rebootResponse> => {
  log.debug('reboot started');
  const res2 = Fula.reboot()
    .then((res) => {
      try {
        const jsonRes: BType.rebootResponse = JSON.parse(res);
        return jsonRes;
      } catch {
        try {
          return JSON.parse(res);
        } catch {
          return res;
        }
      }
    })
    .catch((err) => {
      return err;
    });
  return res2;
};

export const partition = (): Promise<BType.partitionResponse> => {
  log.debug('partition started');
  const res2 = Fula.partition()
    .then((res) => {
      try {
        const jsonRes: BType.partitionResponse = JSON.parse(res);
        return jsonRes;
      } catch {
        try {
          return JSON.parse(res);
        } catch {
          return res;
        }
      }
    })
    .catch((err) => {
      return err;
    });
  return res2;
};

export const eraseBlData = (): Promise<BType.rebootResponse> => {
  log.debug('eraseBlData started');
  const res2 = Fula.eraseBlData()
    .then((res) => {
      try {
        const jsonRes: BType.eraseBlDataResponse = JSON.parse(res);
        return jsonRes;
      } catch {
        try {
          return JSON.parse(res);
        } catch {
          return res;
        }
      }
    })
    .catch((err) => {
      return err;
    });
  return res2;
};

export const fetchContainerLogs = (containerName: string, tailCount: string): Promise<BType.FetchContainerLogsResponse> => {
  log.debug('fetchContainerLogs started', { containerName, tailCount });
  const res = Fula.fetchContainerLogs(containerName, tailCount)
    .then((res1) => {
      try {
        log.debug(`fetchContainerLogs received ${res1.length} chars`);
        const jsonRes: BType.FetchContainerLogsResponse = JSON.parse(res1);
        return jsonRes;
      } catch {
        try {
          return JSON.parse(res1);
        } catch (e1) {
          log.error('Error parsing res in fetchContainerLogs:', e1);
          throw e1; // Rethrow the error to maintain the rejection state
        }
      }
    })
    .catch((err) => {
      log.error('Error fetchContainerLogs:', err);
      throw err; // Rethrow the error to maintain the rejection state
    });
  return res;
};

export const findBestAndTargetInLogs = (containerName: string, tailCount: string): Promise<BType.FindBestAndTargetInLogsResponse> => {
  log.debug('findBestAndTargetInLogs started', { containerName, tailCount });
  const res = Fula.findBestAndTargetInLogs(containerName, tailCount)
    .then((res1) => {
      try {
        const jsonRes: BType.FindBestAndTargetInLogsResponse = JSON.parse(res1);
        return jsonRes;
      } catch {
        try {
          return JSON.parse(res1);
        } catch (e1) {
          log.error('Error parsing res in findBestAndTargetInLogs:', e1);
          throw e1; // Rethrow the error to maintain the rejection state
        }
      }
    })
    .catch((err) => {
      log.error('Error findBestAndTargetInLogs:', err);
      throw err; // Rethrow the error to maintain the rejection state
    });
  return res;
};

export const getFolderSize = (folderPath: string): Promise<BType.GetFolderPathResponse> => {
  log.debug('getFolderSize started', folderPath);
  const res = Fula.getFolderSize(folderPath)
    .then((res1) => {
      try {
        const jsonRes: BType.GetFolderPathResponse = JSON.parse(res1);
        return jsonRes;
      } catch {
        try {
          return JSON.parse(res1);
        } catch (e1) {
          log.error('Error parsing res in getFolderSize:', e1);
          throw e1; // Rethrow the error to maintain the rejection state
        }
      }
    })
    .catch((err) => {
      log.error('Error getFolderSize:', err);
      throw err; // Rethrow the error to maintain the rejection state
    });
  return res;
};

export const getDatastoreSize = (): Promise<BType.GetDatastoreSizeResponse> => {
  log.debug('getDatastoreSize started');
  const res = Fula.getDatastoreSize()
    .then((res1) => {
      try {
        const jsonRes: BType.GetDatastoreSizeResponse = JSON.parse(res1);
        return jsonRes;
      } catch {
        try {
          return JSON.parse(res1);
        } catch (e1) {
          log.error('Error parsing res in getDatastoreSize:', e1);
          throw e1; // Rethrow the error to maintain the rejection state
        }
      }
    })
    .catch((err) => {
      log.error('Error getDatastoreSize:', err);
      throw err; // Rethrow the error to maintain the rejection state
    });
  return res;
};

export const getDockerImageBuildDates = (): Promise<BType.GetDockerImageBuildDatesResponse> => {
  log.debug('getDockerImageBuildDates started');
  const res = Fula.getDockerImageBuildDates()
    .then((res1) => {
      try {
        const jsonRes: BType.GetDockerImageBuildDatesResponse = JSON.parse(res1);
        return jsonRes;
      } catch {
        try {
          return JSON.parse(res1);
        } catch (e1) {
          log.error('Error parsing res in getDockerImageBuildDates:', e1);
          throw e1;
        }
      }
    })
    .catch((err) => {
      log.error('Error getDockerImageBuildDates:', err);
      throw err;
    });
  return res;
};

export const getClusterInfo = (): Promise<BType.GetClusterInfoResponse> => {
  log.debug('getClusterInfo started');
  const res = Fula.getClusterInfo()
    .then((res1) => {
      try {
        const jsonRes: BType.GetClusterInfoResponse = JSON.parse(res1);
        return jsonRes;
      } catch {
        try {
          return JSON.parse(res1);
        } catch (e1) {
          log.error('Error parsing res in getClusterInfo:', e1);
          throw e1;
        }
      }
    })
    .catch((err) => {
      log.error('Error getClusterInfo:', err);
      throw err;
    });
  return res;
};

export const listPlugins = (): Promise<BType.ListPluginsResponse> => {
  log.debug('listPlugins started');
  const res = Fula.listPlugins()
    .then((res1) => {
      try {
        const jsonRes: BType.ListPluginsResponse = JSON.parse(res1);
        return jsonRes;
      } catch {
        try {
          return JSON.parse(res1);
        } catch (e1) {
          log.error('Error parsing res in listPlugins:', e1);
          throw e1;
        }
      }
    })
    .catch((err) => {
      log.error('Error listPlugins:', err);
      throw err;
    });
  return res;
};

export const listActivePlugins = (): Promise<BType.ListActivePluginsResponse> => {
  log.debug('listActivePlugins started');
  const res = Fula.listActivePlugins()
    .then((res1) => {
      try {
        const jsonRes: BType.ListActivePluginsResponse = JSON.parse(res1);
        if (jsonRes.status) {
          return jsonRes;
        } else {
          log.error('Error getting listActivePlugins:', jsonRes.msg);
          throw jsonRes;
        }
      } catch {
        try {
          return JSON.parse(res1);
        } catch (e1) {
          log.error('Error parsing res in listActivePlugins:', e1);
          throw e1;
        }
      }
    })
    .catch((err) => {
      log.error('Error listActivePlugins:', err);
      throw err;
    });
  return res;
};

export const installPlugin = (pluginName: string, params: string): Promise<BType.InstallPluginResponse> => {
  log.debug('installPlugin started', pluginName);
  const res = Fula.installPlugin(pluginName, params)
    .then((res1) => {
      try {
        const jsonRes: BType.InstallPluginResponse = JSON.parse(res1);
        if (jsonRes.status) {
          return jsonRes;
        } else {
          throw jsonRes;
        }
      } catch {
        try {
          return JSON.parse(res1);
        } catch (e1) {
          log.error('Error parsing res in installPlugin:', e1);
          throw e1;
        }
      }
    })
    .catch((err) => {
      log.error('Error installPlugin:', err);
      throw err;
    });
  return res;
};

export const uninstallPlugin = (pluginName: string): Promise<BType.UninstallPluginResponse> => {
  log.debug('uninstallPlugin started', pluginName);
  const res = Fula.uninstallPlugin(pluginName)
    .then((res1) => {
      try {
        const jsonRes: BType.UninstallPluginResponse = JSON.parse(res1);
        if (jsonRes.status) {
          return jsonRes;
        } else {
          throw jsonRes;
        }
      } catch {
        try {
          return JSON.parse(res1);
        } catch (e1) {
          log.error('Error parsing res in uninstallPlugin:', e1);
          throw e1;
        }
      }
    })
    .catch((err) => {
      log.error('Error uninstallPlugin:', err);
      throw err;
    });
  return res;
};

export const showPluginStatus = (pluginName: string, lines: number): Promise<BType.ShowPluginStatusResponse> => {
  log.debug('showPluginStatus started', { pluginName, lines });
  const res = Fula.showPluginStatus(pluginName, lines)
    .then((res1) => {
      try {
        const jsonRes: BType.ShowPluginStatusResponse = JSON.parse(res1);
        return jsonRes;
      } catch {
        try {
          return JSON.parse(res1);
        } catch (e1) {
          log.error('Error parsing res in showPluginStatus:', e1);
          throw e1;
        }
      }
    })
    .catch((err) => {
      log.error('Error showPluginStatus:', err);
      throw err;
    });
  return res;
};

export const getInstallStatus = (pluginName: string): Promise<BType.GetInstallStatusResponse> => {
  log.debug('getInstallStatus started', pluginName);
  const res = Fula.getInstallStatus(pluginName)
    .then((res1) => {
      try {
        const jsonRes: BType.GetInstallStatusResponse = JSON.parse(res1);
        if (jsonRes.status) {
          return jsonRes;
        } else {
          log.error('Error getting install status:', jsonRes.msg);
          throw jsonRes;
        }
      } catch {
        try {
          return JSON.parse(res1);
        } catch (e1) {
          log.error('Error parsing res in getInstallStatus:', e1);
          throw e1;
        }
      }
    })
    .catch((err) => {
      log.error('Error getInstallStatus:', err);
      throw err;
    });
  return res;
};

export const getInstallOutput = (pluginName: string, params: string): Promise<BType.GetInstallOutputResponse> => {
  log.debug('getInstallOutput started', pluginName);
  const res = Fula.getInstallOutput(pluginName, params)
    .then((res1) => {
      try {
        const jsonRes: BType.GetInstallOutputResponse = JSON.parse(res1);
        if (jsonRes.status) {
          return jsonRes;
        } else {
          log.error('Error getting install output:', jsonRes.msg);
          throw jsonRes;
        }
      } catch {
        try {
          return JSON.parse(res1);
        } catch (e1) {
          log.error('Error parsing res in getInstallOutput:', e1);
          throw e1;
        }
      }
    })
    .catch((err) => {
      log.error('Error getInstallOutput:', err);
      throw err;
    });
  return res;
};

export const updatePlugin = (pluginName: string): Promise<BType.UpdatePluginResponse> => {
  log.debug('updatePlugin started', pluginName);
  const res = Fula.updatePlugin(pluginName)
    .then((res1) => {
      try {
        const jsonRes: BType.UpdatePluginResponse = JSON.parse(res1);
        if (jsonRes.status) {
          return jsonRes;
        } else {
          log.error('Error updating plugin:', jsonRes.msg);
          throw jsonRes;
        }
      } catch {
        try {
          return JSON.parse(res1);
        } catch (e1) {
          log.error('Error parsing res in updatePlugin:', e1);
          throw e1;
        }
      }
    })
    .catch((err) => {
      log.error('Error updatePlugin:', err);
      throw err;
    });
  return res;
};
