let randomstring = require('randomstring');
var crypto = require('crypto');

let work_factor = 3;

const mint = (_challenge, _work_factor) => {
	let token;
	let tokenZeros = 0;
	token = crypto
		.createHash('sha256')
		.update(_challenge)
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

const mintFactory = () => {
	let token = null;
	let challenge;

	while (token === null) {
		challenge = randomstring.generate();
		token = mint(challenge, work_factor);
		console.log(challenge)
	}
	return [challenge, token];
};

// let mintedArray = mintFactory();


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

// let verifiedToken = verify(mintedArray[0], mintedArray[1], work_factor);

// console.log(verifiedToken);
