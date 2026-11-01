const fs = require('fs');

let sync = fs.readFileSync('backend/src/services/blockchain/sync.service.ts', 'utf8');

// Replace in syncBlockRange:
const oldParse = `          const parsedArgs: Record<string, any> = {};
          for (const key of Object.keys(eventLog.args)) {
            if (isNaN(Number(key))) {
              parsedArgs[key] = eventLog.args[key];
            }
          }`;

const newParse = `          const parsedArgs: Record<string, any> = {};
          if (eventLog.fragment && eventLog.fragment.inputs) {
            eventLog.fragment.inputs.forEach((input, index) => {
              parsedArgs[input.name] = eventLog.args[index];
            });
          }
          for (const key of Object.keys(eventLog.args)) {
            if (isNaN(Number(key))) {
              parsedArgs[key] = eventLog.args[key];
            }
          }`;

sync = sync.replace(oldParse, newParse);
sync = sync.replace(oldParse.replace(/\n/g, '\r\n'), newParse.replace(/\n/g, '\r\n'));

// Also replace in listeners:
const oldListenerParse = `          const parsedArgs: Record<string, any> = {};
          if (payload.args) {
            for (const key of Object.keys(payload.args)) {
              if (isNaN(Number(key))) {
                parsedArgs[key] = payload.args[key];
              }
            }
          }`;

const newListenerParse = `          const parsedArgs: Record<string, any> = {};
          if (log.fragment && log.fragment.inputs) {
            log.fragment.inputs.forEach((input, index) => {
              parsedArgs[input.name] = log.args[index];
            });
          }
          if (payload.args) {
            for (const key of Object.keys(payload.args)) {
              if (isNaN(Number(key))) {
                parsedArgs[key] = payload.args[key];
              }
            }
          }`;

sync = sync.replace(oldListenerParse, newListenerParse);
sync = sync.replace(oldListenerParse.replace(/\n/g, '\r\n'), newListenerParse.replace(/\n/g, '\r\n'));

// Clean up debug logs in DeviceRevoked
sync = sync.replace(
  /console\.log\('\[DEBUG DeviceRevoked\].*?\n/g,
  ''
);

fs.writeFileSync('backend/src/services/blockchain/sync.service.ts', sync, 'utf8');
console.log('patched sync.service.ts fragment.inputs parser');

