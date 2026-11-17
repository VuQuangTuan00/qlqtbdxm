'use strict';

function publicDbConfig(config) {
  const source = config && typeof config === 'object' ? config : {};
  return {
    server: source.server || source.host || '',
    port: source.port,
    database: source.database || '',
    user: source.user || '',
    fileStorageRoot: source.fileStorageRoot || '',
  };
}

async function resolveDatabaseStartup({ readDbConfig, readDbConfigForRecovery, initDatabase }) {
  let config;
  try {
    config = readDbConfig();
  } catch (error) {
    return {
      mode: 'recovery',
      error: error.message,
      config: publicDbConfig(readDbConfigForRecovery()),
    };
  }

  if (!config) return { mode: 'first-run' };

  try {
    await initDatabase();
    return { mode: 'ready', config: publicDbConfig(config) };
  } catch (error) {
    return {
      mode: 'recovery',
      error: error.message,
      config: publicDbConfig(readDbConfigForRecovery() || config),
    };
  }
}

module.exports = { resolveDatabaseStartup, publicDbConfig };
