import { utilityProcess } from 'electron';
import { join } from 'path';
import { remoteControlEnv } from '../remoteControl/remoteControlServer';

export function createPiAgentProcess(): Electron.UtilityProcess {
  const modulePath = join(__dirname, 'processes/utility/piAgent.js');
  return utilityProcess.fork(modulePath, [], {
    serviceName: 'pi-agent',
    env: remoteControlEnv(),
  });
}

export function createSessionWorkerProcess(): Electron.UtilityProcess {
  const modulePath = join(__dirname, 'processes/utility/sessionWorker.js');
  return utilityProcess.fork(modulePath, [], {
    serviceName: 'session-worker',
    env: { ...process.env },
  });
}

export function createTerminalProcess(): Electron.UtilityProcess {
  const modulePath = join(__dirname, 'processes/utility/terminal.js');
  return utilityProcess.fork(modulePath, [], {
    serviceName: 'terminal',
    env: remoteControlEnv(),
  });
}

/** Piped stdio: npm and git inherit it, and their output is the failure report. */
export function createPackageWorkerProcess(): Electron.UtilityProcess {
  const modulePath = join(__dirname, 'processes/utility/packageWorker.js');
  return utilityProcess.fork(modulePath, [], {
    env: {
      ...process.env,
      // No terminal to answer a git credential prompt: fail instead of waiting
      // out the operation timeout (pi's docs recommend it for non-interactive runs).
      GIT_TERMINAL_PROMPT: '0',
      // pi updates with `npm install <name>@latest`, which trusts npm's cached
      // packument: it installed 0.46.0 days after 0.47.0 shipped, while the
      // update check's `npm view` saw 0.47.0, so Update never went away.
      npm_config_prefer_online: 'true',
    },
    stdio: 'pipe',
    serviceName: 'pi packages',
  });
}
