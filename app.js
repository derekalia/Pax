var express = require('express');
var app = express();
var req = require('request');
const cluster = require('cluster');
const numCPUs = require('os').cpus().length;
var port = process.argv[2] || 3000;
var targetPort = process.argv[3] || 3001;
var host = 'localhost';
var http = require('http');
var request = require('request');
var bodyParser = require('body-parser');
const uuidv1 = require('uuid');
var mint = require('./mint.js');
let randomstring = require('randomstring');
var crypto = require('crypto');
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

//we need to restore state (version) when a node comes back online

if (cluster.isMaster) {
  console.log(`Master ${process.pid} is running`);

  var balances = [];
  var block = [];

  let nodeState = {};
  var favBook = 'Story';
  var version = 0;
  var gossipHistory = [];
  var peers = [];
  var ttl = 2;
  const blockchain = [];

  let minter;
  let startingToken = 'd939dj3';
  let work_factor = 5;

  //receive message
  let listen = minter => {
    minter.on('message', async msg => {
      if (msg.type === 'found') {
        blockBuilder(msg.challenge, msg.token, msg.work_factor, msg.previousToken);
        newChallenge(msg.token, msg.work_factor, minter);
      } else {
        console.log(
          `master ${process.pid} recevies message '${JSON.stringify(message)}' from worker ${minter.process.pid}`
        );
      }
    });

    // minter.on('disconnect', () => {
    //   console.log('startingToken1', startingToken);
    //   startMinter(startingToken, work_factor);
    // });

    // minter.on('exit', (minter, code, signal) => {
    //   if (minter.exitedAfterDisconnect === true) {
    //     console.log('Oh, it was just voluntary – no need to worry');
    //   }
    // });
  };

  const startMinter = (_startingToken, _work_factor) => {
    minter = cluster.fork();
    listen(minter);
    console.log('starting new minter');
    minter.send({ type: 'start', startingToken: _startingToken, work_factor: _work_factor });
  };

  const newChallenge = (_startingToken, _work_factor, minter) => {
    console.log('restarting minter');
    minter.send({ type: 'start', startingToken: _startingToken, work_factor: _work_factor });
  };

  const killMinter = minter => {
    minter.send('shutdown');
    minter.disconnect();
  };


  const blockBuilder = (challenge, token, _work_factor, previousToken) => {
    console.log('building the block');

    //create block
    let uuid = uuidv1();
    const blockMessage = {
      messageType: 'block',
      UUID: uuid,
      fromPort: port,
      version: version,
      TTL: ttl,
      challenge,
      token,
      work_factor,
      block,
      previousToken
    };

    //add it locally
    block = [];

    //update challenge
    console.log('startingToken1', startingToken);
    startingToken = token;
    work_factor = _work_factor;

    //send block out
    gossip(blockMessage, peers);
  };

  // naive: tx get pushed into this arr, if a block is found, we batch these tx run over the balances an update those
  //then bundle them into a block and push that block to the nodes we are connected to

  //pick a random book and set it to favBook
  const pickRandomBook = () => {
    let random = Math.floor(Math.random() * 5) + 1;

    favBook = books[random];

    //prepare book message
    //generate uuid
    let uuid = uuidv1();
    version = version + 1;

    let msg = {
      messageType: 'book',
      UUID: uuid,
      fromPort: port,
      version: version,
      TTL: ttl,
      favBook: favBook
    };
    gossip(msg, peers);
  };

  const pickRandomTx = () => {
    let amount = Math.floor(Math.random() * 55) + 1;
    let uuid = uuidv1();
    const randomPort = peers[Math.floor(Math.random() * peers.length)];
    const randomTx = {
      messageType: 'tx',
      amount: amount,
      UUID: uuid,
      fromPort: port,
      toPort: randomPort,
      version: version,
      TTL: ttl
    };
    gossip(randomTx, peers);
  };

  setInterval(pickRandomTx, 50000);

  const verify = (_challenge, _token, _work_factor) => {
    let token = crypto
      .createHash('sha256')
      .update(_challenge)
      .digest('hex');

    let tokenZeros = 0;

    for (var i = 0; i < token.length; i++) {
      if (token[i] === '0') {
        tokenZeros++;
      } else {
        break;
      }
    }

    if (_token == token && tokenZeros >= _work_factor) {
      return true;
    }
    return false;
  };

  const gossip = (msg, nodePeers) => {
    //loop that sends to all peers
    for (var i = 0; i < nodePeers.length; i++) {
      console.log("nodePeers.length", nodePeers)
      request(
        {
          url: 'http://localhost:' + nodePeers[i] + '/gossip',
          method: 'POST',
          json: msg
        },
        function(error, response, body) {
          if (error) console.log('error', error);
        }
      );
    }
  };

  app.post('/gossip', (req, res) => {
    console.log(`Node${port} recieved book: ${req.body.favBook} from Node${req.body.fromPort}`);
    console.log('test req.body: ', req.body);
    // const currentNodeState = nodeState['3000'];
    //check uuid // TODO: add to uuid history
    if (req.body.type === 'book') {
      const messagePort = req.body.fromPort;
      const portNodeState = nodeState[messagePort];

      if (portNodeState) {
        if (req.body['UUID'] !== portNodeState.UUID) {
          console.log('uuid: ', req.body['UUID'], 'nodestate uuid > ', portNodeState.UUID);
          //check version numbers
          if (req.body.version > portNodeState.version) {
            console.log(' body version >', req.body.version, 'nodestate version > ', portNodeState.version);
            //set to state
            nodeState[messagePort] = req.body;
          }
        }
      } else {
        nodeState[messagePort] = req.body;
        console.log(nodeState, '< nodestate');
      }
    }

    if (req.body.messageType === 'tx') {
      console.log('tx body :', req.body);
      const foundIndex = block.findIndex(tx => {
        return tx['UUID'] == req.body['UUID'];
      });
      console.log('FOUNDINDEX: ', foundIndex);
      if (foundIndex < 0) {
        console.log('pusssssheeeed');

        block.push(req.body);
      }
    }

    if (req.body.messageType === 'block') {
      console.log('block body :', req.body);

      let block = req.body;

      //verify
      const verify = (_challenge, _token, _work_factor, _previousToken) => {
        console.log('VERIFY DEF');
        let token = crypto
          .createHash('sha256')
          .update(_challenge + _previousToken)
          .digest('hex');

        let tokenZeros = 0;

        for (var i = 0; i < token.length; i++) {
          if (token[i] === '0') {
            tokenZeros++;
          } else {
            break;
          }
        }
        if (_token == token && tokenZeros >= _work_factor) {
          return true;
        }
        return false;
      };
      let tokenconsole = crypto
        .createHash('sha256')
        .update(block.challenge + block.previousToken)
        .digest('hex');

      console.log('TOKENS', block.token == tokenconsole);
      // console.log('CHALLENGE TOKEN WORK', block.challenge, block.token, block.work_factor);

      if (verify(block.challenge, block.token, block.work_factor, block.previousToken)) {
        console.log('IN HERE');
        blockchain.push(block);

        startingToken = block.token;
        work_factor = block.work_factor;

        killMinter(minter);
      }
    }

    // continue to push message based on ttl
    const hoppedMessage = req.body;
    if (hoppedMessage.TTL > 0) {
      console.log('hopped >>>>>', hoppedMessage.TTL);
      hoppedMessage.TTL = hoppedMessage.TTL - 1; //convert to spread
      //loop that sends to all peers
      for (var i = 0; i < peers.length; i++) {
        request(
          {
            url: 'http://localhost:' + peers[i] + '/gossip',
            method: 'POST',
            json: hoppedMessage
          },
          function(error, response, body) {
            // if (error) console.log('error', error);
          }
        );
      }
    }
    //check ttl - decrement
    //push to other peers
    res.send('push recieved');
  });

  //Client Routes
  app.get('/nodeState', (req, res) => {
    res.send(nodeState);
  });

  app.get('/block', (req, res) => {
    res.send(block);
  });

  app.get('/blockchain', (req, res) => {
    res.send(blockchain);
  });

  app.get('/favBook', (req, res) => {
    res.send(favBook);
  });

  app.get('/getPeers', (req, res) => {
    res.send(peers);
  });

  app.get('/', (req, res) => {
    // console.log(books);
    res.sendFile(__dirname + '/index.html');
  });

  const bootstrap = () => {
    request(
      {
        url: 'http://localhost:' + targetPort + '/peers',
        method: 'POST',
        json: { fromPort: port }
      },
      function(error, response, body) {
        let otherPort = String(body);

        if (`peers.indexOf(otherPort) === -1 && otherPort !== 'undefined'`) {
          peers.push(otherPort);
        }
      }
    );
  };

  bootstrap();

  app.post('/peers', (req, res) => {
    let otherPort = req.body.fromPort;
    if (peers.indexOf(otherPort) === -1) {
      peers.push(otherPort);
    }
    res.send(port);
  });

  app.listen(port, () => {
    console.log('Server listening on port ' + port);
    startMinter(startingToken, work_factor);
  });

  const books = [
    'Lucky Jim by Kingsley Amis',
    'Money by Martin Amis',
    'The Information by Martin Amis',
    'The Bottle Factory Outing by Beryl Bainbridge',
    'According to Queeney by Beryl Bainbridge',
    "Flaubert's Parrot by Julian Barnes"
  ];
} else {
  //minter code
  console.log(`Minter ${process.pid} started`);

  let lastToken;

  process.on('message', msg => {
    if (msg.type == 'start') {
      console.log(`starting with ${msg.startingToken} and ${msg.work_factor} `);
      mintFactory(msg.startingToken, msg.work_factor);
    } else {
      console.log('Gee thanks', msg);
    }
  });

  const mintFactory = (_startingToken, _work_factor) => {
    let token = null;
    let challenge;

    while (token === null) {
      challenge = randomstring.generate();
      token = mint(challenge, _work_factor, _startingToken);

      // console.log(challenge);
    }
    sendToken(challenge, token, _work_factor, _startingToken);
  };

  const mint = (_challenge, _work_factor, _startingToken) => {
    let token;
    let tokenZeros = 0;

    token = crypto
      .createHash('sha256')
      .update(_challenge + _startingToken)
      .digest('hex');

    for (var i = 0; i < token.length; i++) {
      if (token[i] === '0') {
        tokenZeros++;
      } else {
        break;
      }
    }
    if (tokenZeros >= _work_factor) {
      return token;
    } else {
      return null;
    }
  };

  const sendToken = (challenge, token, work_factor, previousToken) => {
    console.log('found token!');
    process.send({ type: 'found', challenge, token, work_factor, previousToken });
  };
}
