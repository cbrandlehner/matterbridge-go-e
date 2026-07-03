/**
 * @file module.ts
 * @description Matterbridge go-e plugin entry point.
 */

import type { PlatformMatterbridge } from 'matterbridge';
import type { AnsiLogger } from 'matterbridge/logger';

import { GoEPlatform, type GoEPlatformConfig } from './platform.js';

/**
 * Initializes the matterbridge-go-e plugin.
 *
 * @param {PlatformMatterbridge} matterbridge - Matterbridge host API.
 * @param {AnsiLogger} log - Platform logger.
 * @param {GoEPlatformConfig} config - Plugin configuration.
 * @returns {GoEPlatform} Platform instance.
 */
export default function initializePlugin(matterbridge: PlatformMatterbridge, log: AnsiLogger, config: GoEPlatformConfig): GoEPlatform {
  return new GoEPlatform(matterbridge, log, config);
}

export { GoEPlatform, type GoEPlatformConfig } from './platform.js';
