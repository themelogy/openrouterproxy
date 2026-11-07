// Tests must never touch the real ~/.config config file or ~/.claude/settings.json.
import { join } from 'path';
import { tmpdir } from 'os';
import { randomUUID } from 'crypto';

const testDir = join(tmpdir(), `cc-proxy-test-${randomUUID()}`);
process.env.CC_PROXY_CONFIG_PATH = join(testDir, 'config.json');
process.env.CLAUDE_SETTINGS_PATH = join(testDir, 'settings.json');
