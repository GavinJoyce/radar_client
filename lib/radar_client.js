var log = require('minilog')('radar_client'),
    MiniEventEmitter = require('miniee'),
    eio = require('engine.io-client'),
    Scope = require('./scope.js'),
    StateMachine = require('./state.js');

function Client(backend) {
  var self = this;
  this._me = { accountName: '', userId: 0, userType: 0 };
  this._ackCounter = 1;
  this._channelSyncTimes = {};
  this._users = {};

  this.manager = new StateMachine();
  // allow backend substitution for tests
  if (!backend) { backend = eio; }
  this.manager.createSocket = function(config) {
    return new backend.Socket(config);
  };
  this.manager.handleMessage = function (msg) {
    log.info('[C '+self._me.userId+'] In', msg);
    try {
      msg = JSON.parse(msg);
    } catch(e) { throw e; }
    switch(msg.op) {
      case 'ack':
      case 'get':
        self.emit(msg.op, msg);
        break;
      case 'sync':
        self._batch(msg);
        break;
      default:
        self.emit(msg.to, msg);
    }
  };
}

MiniEventEmitter.mixin(Client);

// alloc() and dealloc() rather than connect() and disconnect() - see readme.md
Client.prototype.alloc = function(name, callback) {
  log.info('alloc', name);
  this._users[name] = true;
  callback && this.once('ready', callback);
  this.manager.connect();
  return this;
};

Client.prototype.dealloc = function(name) {
  log.info('dealloc', name);
  delete this._users[name];
  var count = 0, key;
  for(key in this._users) {
    if(this._users.hasOwnProperty(key)) count++;
  }
  if(count === 0) {
    this.manager.disconnect();
  }
};

Client.prototype.configure = function(config) {
  config || (config = {});
  config.userType || (config.userType = 0);
  this._me = config;
  this.manager.configure(this, config);
  return this;
};

Client.prototype.message = function(scope) {
  return new Scope('message:/'+this._me.accountName+'/'+scope, this);
};

// Access the "presence" chainable operations
Client.prototype.presence = function(scope) {
  return new Scope('presence:/'+this._me.accountName+'/'+scope, this);
};

// Access the "status" chainable operations
Client.prototype.status = function(scope) {
  return new Scope('status:/'+this._me.accountName+'/'+scope, this);
};

Client.prototype.set = function(scope, value, callback) {
  return this._write({
    op: 'set',
    to: scope,
    value: value,
    key: this._me.userId,
    type: this._me.userType
  }, callback);
};

Client.prototype.publish = function(scope, value, callback) {
  return this._write({
    op: 'publish',
    to: scope,
    value: value
  }, callback);
};

Client.prototype.subscribe = function(scope, callback) {
  return this._write({ op: 'subscribe', to: scope }, callback);
};

Client.prototype.unsubscribe = function(scope, callback) {
  return this._write({ op: 'unsubscribe', to: scope }, callback);
};

// Sync and get return the actual value of the operation
var init = function(name) {
  Client.prototype[name] = function(scope, callback) {
    this.when('get', function(message) {
      if(!message || !message.to || message.to != scope) { return false; }
      callback && callback(message);
      return true;
    });

    return this._write({ op: name, to: scope });
  };
};

var props = ['get', 'sync'];
for(var i = 0; i < props.length; i++){
  init(props[i]);
}

Client.prototype._write = function(message, callback) {
  if(callback) {
    message.ack = this._ackCounter++;
    // wait ack
    this.when('ack', function(m) {
      if(!m || !m.value || m.value != message.ack) { return false; }
      callback(message);
      return true;
    });
  }
  log.info('[C '+this._me.userId+'] Out', JSON.stringify(message));
  this.manager.send(message);
  return this;
};

Client.prototype._batch = function(msg) {
  if(!(msg.to && msg.value && msg.time)) { return; }

  var index = 0,
      length = msg.value.length,
      newest = msg.time,
      current = this._channelSyncTimes[msg.to] || 0;

  for(; index < length; index = index + 2) {
    var message = msg.value[index],
        time = msg.value[index + 1];
    try {
      message = JSON.parse(message);
    } catch(e) { throw e; }
    if(time > current) { this.emit(msg.to, message); }
    if(time > newest) { newest = time; }
  }
  this._channelSyncTimes[msg.to] = newest;
};

Client.setBackend = function(lib) { eio = lib; };

module.exports = Client;