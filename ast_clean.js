const net = require('net');

const AMI_HOST = '10.170.7.32';
const AMI_PORT = 5038;
const AMI_USER = 'admin';
const AMI_PASS = 'amp111';

let buffer = '';
const calls = {};  // uid → { callerID, callerName, status:'IN_QUEUE'|'IN_CURS', agent, tsEnter }

function parseBlock(block) {
  const obj = {};
  block.split('\r\n').forEach(line => {
    const idx = line.indexOf(':');
    if (idx > -1) {
      obj[line.substring(0, idx).trim()] = line.substring(idx + 1).trim();
    }
  });
  return obj;
}

function elapsed(tsEnter) {
  return Math.floor((Date.now() / 1000) - tsEnter);
}

function getCaller(obj) {
  return (obj.CallerIDNum || obj.CallerIDnum || obj.CallerID || obj.Callerid || '').trim();
}

function getUid(obj) {
  return (obj.UniqueID || obj.Uniqueid || obj.uniqueid || '').trim();
}

function printStatus() {
  console.clear();
  console.log(`=== APELURI ACTIVE === ${new Date().toLocaleTimeString('ro-RO')}\n`);

  const talkList = Object.values(calls).filter(c => c.status === 'IN_CURS');
  console.log(`SE VORBESTE (${talkList.length}):`);
  if (!talkList.length) {
    console.log('  -');
  } else {
    talkList.forEach(c => {
      console.log(`  ${c.callerID || '-'}  agent=${c.agent || '-'}  ${elapsed(c.tsEnter)}s`);
    });
  }

  const waitList = Object.values(calls).filter(c => c.status === 'IN_QUEUE');
  console.log(`\nIN COADA (${waitList.length}):`);
  if (!waitList.length) {
    console.log('  -');
  } else {
    waitList.forEach(c => {
      console.log(`  ${c.callerID || '-'}  asteapta ${elapsed(c.tsEnter)}s`);
    });
  }
  console.log('');
}

function requestStatus() {
  // Curăță doar IN_QUEUE — IN_CURS rămâne până la Hangup/Bridge:Unlink
  // (apelurile conectate NU apar în QueueStatus, deci nu le putem recupera de acolo)
  Object.keys(calls).forEach(k => {
    if (calls[k].status === 'IN_QUEUE') delete calls[k];
  });
  socket.write('Action: QueueStatus\r\n\r\n');
}

const socket = net.createConnection({ host: AMI_HOST, port: AMI_PORT });

socket.on('connect', () => {
  socket.write(`Action: Login\r\nUsername: ${AMI_USER}\r\nSecret: ${AMI_PASS}\r\n\r\n`);
});

socket.on('data', data => {
  buffer += data.toString();
  const blocks = buffer.split('\r\n\r\n');
  buffer = blocks.pop();

  blocks.forEach(block => {
    if (!block.trim()) return;
    const obj = parseBlock(block);

    if (obj.Response === 'Success' && obj.Message === 'Authentication accepted') {
      requestStatus();
      setInterval(requestStatus, 5000);
    }

    const uid = getUid(obj);

    // ── Caller in coada — snapshot QueueStatus
    if (obj.Event === 'QueueEntry' && uid) {
      const wait = parseInt(obj.Wait || '0', 10);
      calls[uid] = {
        callerID: getCaller(obj),
        status: 'IN_QUEUE',
        agent: '',
        tsEnter: Date.now() / 1000 - wait,
      };
    }

    // ── Caller a intrat in coada — eveniment live
    // Asterisk vechi (1.x) trimite 'Join', cel nou trimite 'QueueCallerJoin'
    if ((obj.Event === 'Join' || obj.Event === 'QueueCallerJoin') && uid) {
      calls[uid] = {
        callerID: getCaller(obj),
        status: 'IN_QUEUE',
        agent: '',
        tsEnter: Date.now() / 1000,
      };
      printStatus();
    }

    // ── Agent a raspuns — Asterisk 1.x trimite Bridge:Link (nu AgentConnect!)
    if (obj.Event === 'Bridge' && obj.Bridgestate === 'Link') {
      const uid1 = (obj.Uniqueid1 || '').trim();
      const callerID1 = (obj.CallerID1 || '').trim();
      // "SIP/telefon5-00000101" → "telefon5"
      const agent = (obj.Channel2 || '').replace('SIP/', '').replace(/-[a-f0-9]+$/, '');
      if (uid1) {
        if (calls[uid1]) {
          calls[uid1].status = 'IN_CURS';
          calls[uid1].agent = agent;
          if (callerID1 && !calls[uid1].callerID) calls[uid1].callerID = callerID1;
        } else {
          // Apel activ la restart backend
          calls[uid1] = {
            callerID: callerID1,
            status: 'IN_CURS',
            agent,
            tsEnter: Date.now() / 1000,
          };
        }
        printStatus();
      }
    }

    // ── Caller/agent a inchis
    if (obj.Event === 'Hangup' && uid && calls[uid]) {
      delete calls[uid];
      printStatus();
    }

    // ── Abandon explicit (Asterisk nou)
    if (obj.Event === 'QueueCallerAbandon' && uid) {
      delete calls[uid];
      printStatus();
    }

    if (obj.Event === 'QueueStatusComplete') {
      printStatus();
    }
  });
});

socket.on('error', err => console.error('Eroare:', err.message));
socket.on('close', () => console.log('Conexiune inchisa.'));
