// Tests must never touch the real ~/.config config file.
import { join } from 'path';
import { tmpdir } from 'os';
import { randomUUID } from 'crypto';

process.env.CC_PROXY_CONFIG_PATH = join(tmpdir(), `cc-proxy-test-${randomUUID()}.json`);
