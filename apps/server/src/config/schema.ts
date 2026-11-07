import { AppConfigSchema } from '@shared/types';
import { join } from 'path';
import { homedir } from 'os';

export const CONFIG_PATH = process.env.CC_PROXY_CONFIG_PATH
  || join(homedir(), '.config', 'claude-code-openrouter', 'config.json');
export { AppConfigSchema };
