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
