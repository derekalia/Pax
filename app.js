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

  const minter = cluster.fork();

  let startingToken = 'd939dj3';
  //send it a msg=
  minter.send({ type: 'start', startingToken, work_factor: 5 });

  //receive message
  minter.on('message', msg => {
    if (msg.type === 'found') {
      console.log('found it', msg.token);
      console.log('found it', msg.challenge);
      console.log('found it', msg.work_factor);
      foundAnswer(msg.challenge, msg.token);
    } else {
      console.log(
        `master ${process.pid} recevies message '${JSON.stringify(message)}' from worker ${minter.process.pid}`
      );
    }
  });

  //send minter a token to use to start hashing
  cluster.on('exit', (worker, code, signal) => {
    console.log(`worker ${worker.process.pid} died`);
  });

  const foundAnswer = (challenge, token) => {
    return;
  };

  //3000: {port:3000, uuid: 3001, va}
  let nodeState = {};
  var favBook = 'Story';
  var version = 0;
  var gossipHistory = [];
  var peers = [];
  var ttl = 2;

  //pick a random book and set it to favBook
  const pickRandomBook = () => {
    let random = Math.floor(Math.random() * 55) + 1;
    favBook = books[random];
    gossip();
  };

  //call that function every 10 sec
  setInterval(pickRandomBook, 5000);

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

  //generate uuid
  const gossip = () => {
    let uuid = uuidv1();

    let msg = {
      UUID: uuid,
      fromPort: port,
      version: version,
      TTL: ttl,
      favBook: favBook
    };

    version = version + 1;
    //loop that sends to all peers
    for (var i = 0; i < peers.length; i++) {
      request(
        {
          url: 'http://localhost:' + peers[i] + '/gossip',
          method: 'POST',
          json: msg
        },
        function(error, response, body) {
          // if (error) console.log('error', error)
        }
      );
    }
  };

  app.post('/gossip', (req, res) => {
    console.log(`Node${port} recieved book: ${req.body.favBook} from Node${req.body.fromPort}`);
    console.log('test req.body: ', req.body);
    // const currentNodeState = nodeState['3000'];
    //check uuid // TODO: add to uuid history
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

  app.get('/nodeState', (req, res) => {
    res.send(nodeState);
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

        if (peers.indexOf(otherPort) === -1 && otherPort !== 'undefined') {
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
  });

  const books = [
    'Lucky Jim by Kingsley Amis',
    'Money by Martin Amis',
    'The Information by Martin Amis',
    'The Bottle Factory Outing by Beryl Bainbridge',
    'According to Queeney by Beryl Bainbridge',
    "Flaubert's Parrot by Julian Barnes",
    'A History of the World in 10 1/2 Chapters by Julian Barnes',
    'Augustus Carp, Esq. by Himself: Being the Autobiography of a Really Good Man by Henry Howarth Bashford',
    'Molloy by Samuel Beckett',
    'Zuleika Dobson by Max Beerbohm',
    'The Adventures of Augie March by Saul Bellow',
    'The Uncommon Reader by Alan Bennett',
    'Queen Lucia by EF Benson',
    'The Ascent of Rum Doodle by WE Bowman',
    'A Good Man in Africa by William Boyd',
    'The History Man by Malcolm Bradbury',
    'No Bed for Bacon by Caryl Brahms and SJ Simon',
    'Illywhacker by Peter Carey',
    'A Season in Sinji by JL Carr',
    'The Harpole Report by JL Carr',
    'The Hearing Trumpet by Leonora Carrington',
    'Mister Johnson by Joyce Cary',
    "The Horse's Mouth by Joyce Cary",
    'Don Quixote by Miguel de Cervantes',
    'The Case of the Gilded Fly by Edmund Crispin',
    'Just William by Richmal Crompton',
    'The Provincial Lady by EM Delafield',
    'Slouching Towards Kalamazoo by Peter De Vries',
    'The Pickwick Papers by Charles Dickens',
    'Martin Chuzzlewit by Charles Dickens',
    'Jacques the Fatalist and his Master by Denis Diderot',
    'A Fairy Tale of New York by JP Donleavy',
    'The Commitments by Roddy Doyle',
    'Ennui by Maria Edgeworth',
    'Cheese by Willem Elsschot',
    "Bridget Jones's Diary by Helen Fielding",
    'Joseph Andrews by Henry Fielding',
    'Tom Jones by Henry Fielding',
    'Caprice by Ronald Firbank',
    'Bouvard et Pécuchet by Gustave Flaubert',
    'Towards the End of the Morning by Michael Frayn',
    'The Polygots by William Gerhardie',
    'Cold Comfort Farm by Stella Gibbons',
    'Dead Souls by Nikolai Gogol',
    'Oblomov by Ivan Goncharov',
    'The Wind in the Willows by Kenneth Grahame',
    "Brewster's Millions by Richard Greaves (George Barr McCutcheon)",
    "Squire Haggard's Journal by Michael Green",
    'Our Man in Havana by Graham Greene',
    'Travels with My Aunt by Graham Greene',
    'Diary of a Nobody by George Grossmith',
    'The Little World of Don Camillo by Giovanni Guareschi',
    'The Curious Incident of the Dog in the Night-time by Mark Haddon',
    'Catch-22 by Joseph Heller',
    'Mr Blandings Builds His Dream House by Eric Hodgkins'
  ];
} else {
  //minter code
  console.log(`Worker ${process.pid} started`);

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
      console.log(challenge);
    }
    sendAnswer(challenge, token, _work_factor);
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

  const sendAnswer = (challenge, token, work_factor) => {
    process.send({ type: 'found', challenge, token, work_factor });
  };
}
