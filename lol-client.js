
  var EventEmitter, LolClient, RTMPClient, RTMPCommand, loginQueue, lolPackets, rtmp, tls,
    __bind = function(fn, me){ return function(){ return fn.apply(me, arguments); }; },
    __hasProp = {}.hasOwnProperty,
    __extends = function(child, parent) { for (var key in parent) { if (__hasProp.call(parent, key)) child[key] = parent[key]; } function ctor() { this.constructor = child; } ctor.prototype = parent.prototype; child.prototype = new ctor(); child.__super__ = parent.prototype; return child; };

  tls = require('tls');

  loginQueue = require('./lib/login-queue');

  lolPackets = require('./lib/packets');

  rtmp = require('namf/rtmp');

  RTMPClient = rtmp.RTMPClient;

  RTMPCommand = rtmp.RTMPCommand;

  EventEmitter = require('events').EventEmitter;

  var util = require('util');

  LolClient = (function(_super) {
    __extends(LolClient, _super);

    LolClient.prototype._rtmpHosts = {
      'na': 'prod.na1.lol.riotgames.com',
      'euw': 'prod.euw1.lol.riotgames.com', //prod.euw1.lol.riotgames.com
      'eune': 'prod.eun1.lol.riotgames.com'
    };

    LolClient.prototype._loginQueueHosts = {
      'na': 'lq.na1.lol.riotgames.com',
      'euw': 'lq.euw1.lol.riotgames.com',
      'eune': 'lq.eun1.lol.riotgames.com'
    };
    

    function LolClient(options) {
      this.options = options;
      this.getSummonerData = __bind(this.getSummonerData, this);
      this.getTeamById = __bind(this.getTeamById, this);
      this.getTeamsForSummoner = __bind(this.getTeamsForSummoner, this);
      this.getAggregatedStats = __bind(this.getAggregatedStats, this);
      this.getMatchHistory = __bind(this.getMatchHistory, this);
      this.getSummonerStats = __bind(this.getSummonerStats, this);
      this.getSummonerByName = __bind(this.getSummonerByName, this);
      this.performAuth = __bind(this.performAuth, this);
      this.performLogin = __bind(this.performLogin, this);
      this.getCurrentGameByName = __bind(this.getCurrentGameByName, this);
      this.GNPacket = __bind(this.GNPacket, this);
      this.CNPacket = __bind(this.CNPacket, this);
      this.BCPacket = __bind(this.BCPacket, this);
      this.HeartBeat = __bind(this.HeartBeat, this);
      this.doCreateGame = __bind(this.doCreateGame, this);


      if (this.options.region) {
        this.options.host = this._rtmpHosts[this.options.region];
        this.options.lqHost = this._loginQueueHosts[this.options.region];
      } else {
        this.options.host = this.options.host;
        this.options.lqHost = this.option.lqHost;
      }
      this.options.port = this.options.port || 2099;
      this.options.username = this.options.username;
      this.options.password = this.options.password;
      this.options.version = this.options.version || '3.15.13_12_13_16_07';
      this.options.debug = this.options.debug || false;
      if (this.options.debug) {
        //console.log(this.options);
      }
    }



    LolClient.prototype.connect = function(cb) {
      var _this = this;
      console.log("Logging in..");
      return this.checkLoginQueue(function(err, token) {
        if (err) {
          console.log(err);
        }
        return _this.sslConnect(function(err, stream) {
          console.log('stream connected');
          _this.stream = stream;
          return _this.setupRTMP();
        });
      });
    };

    LolClient.prototype.checkLoginQueue = function(cb) {
      var _this = this;
      if (this.options.debug) {
        console.log('Checking Login Queue');
      }
      return loginQueue(this.options.lqHost, this.options.username, this.options.password, function(err, response) {
        if (err) {
          if (_this.options.debug) {
            console.log('Login Queue Failed');
          }
          if (err && _this.options.debug) {
            console.log("err: " + err);
          }
        } else {
          if (!response.token) {
            // IN QUEUE
            var champ = response.champ, // Name of login queue
            rate = response.rate, // How many tickets are processed every queue update
            delay = response.delay, // How often the queue updates
            node = response.node;
            id = 0, cur = 0;
            console.log(response);
            
            for (var i=0; i<response.tickers.length; i++){
              if (response.tickers[i].node == node){ // Find our login node, and retrieve data
                id = response.tickers[i].id;
                cur = response.tickers[i].current;
              }
            }
            console.log("In login queue. #" + (id - cur) + " in line.")
              setTimeout(function(){
                return _this.checkLoginQueue(function(err, token) {
              if (err) {
              console.log(err);
              }
              return _this.sslConnect(function(err, stream) {
              console.log('stream connected');
              _this.stream = stream;
              return _this.setupRTMP();
                  });
                });
              }, delay);
          } else {
            if (_this.options.debug) {
              console.log('Login Queue Response', response);
            }
            _this.options.queueToken = response.token;
            return cb(null, _this.options.queueToken);
          }
        }
      });
    };

    LolClient.prototype.sslConnect = function(cb) {
      var stream,
        _this = this;
      if (this.options.debug) {
        console.log('Connecting to SSL');
      }
      stream = tls.connect(this.options.port, this.options.host, function() {
        return cb(null, stream);
      });
      return stream.on('error', function() {
        return stream.destroySoon();
      });
    };

    LolClient.prototype.setupRTMP = function() {
      var _this = this;
      if (this.options.debug) {
        console.log('Setting up RTMP Client');
      }
      this.rtmp = new RTMPClient(_this);
      if (this.options.debug) {
        console.log('Handshaking RTMP');
      }
      return this.rtmp.handshake(function(err) {
        if (err) {
          return _this.stream.destroy();
        } else {
          return _this.performNetConnect();
        }
      });
    };

    LolClient.prototype.performNetConnect = function() {
      var ConnectPacket, cmd, pkt,
        _this = this;
      if (this.options.debug) {
        console.log('Performing RTMP NetConnect');
      }
      ConnectPacket = lolPackets.ConnectPacket;
      pkt = new ConnectPacket(this.options);
      cmd = new RTMPCommand(0x14, 'connect', null, pkt.appObject(), [false, 'nil', '', pkt.commandObject()]);
      return this.rtmp.send(cmd, function(err, result) {
        if (err) {
          if (_this.options.debug) {
            console.log('NetConnect failed');
          }
          return _this.stream.destroy();
        } else {
          if (_this.options.debug) {
            console.log('NetConnect success');
          }
          return _this.performLogin(result);
        }
      });
    };

    LolClient.prototype.performLogin = function(result) {
      var LoginPacket, cmd,
        _this = this;
      if (this.options.debug) {
        console.log('Performing RTMP Login...');
      }
      LoginPacket = lolPackets.LoginPacket;
      this.options.dsid = result.args[0].id;
      cmd = new RTMPCommand(0x11, null, null, null, [new LoginPacket(this.options).generate(this.options.version)]);
      return this.rtmp.send(cmd, function(err, result) {
        if (err) {
          if (_this.options.debug) {
            console.log('RTMP Login failed');
          }
          return _this.stream.destroy();
        } else {
          return _this.performAuth(result);
        }
      });
    };
    //HeartBeat method
    LolClient.prototype.HeartBeat = function() {
      var stop = false;
      var returnheart = function(){
        return stop = true;
      }

      

      var HeartBeat, cmd,
        _this = this;
      if (this.options.debug) {
        console.log('Performing HeartBeat');
      }
      HeartBeat = lolPackets.HeartbeatPacket;
      
      
      cmd = new RTMPCommand(0x11, null, null, null, [new HeartBeat(this.options).generate()]);
      return _this.rtmp.send(cmd, function(err, result) {
        if (err) {
          if (_this.options.debug) {
            console.log('HeartBeat Failed');
            console.log(err);
          }
          
        } else {
          
          //return console.log('HeartBeat Success');
        }
      });
    };
    LolClient.prototype.performAuth = function(result) {
      var AuthPacket, cmd,
        _this = this;
      if (this.options.debug) {
        console.log('Performing RTMP Auth..');
      }
      AuthPacket = lolPackets.AuthPacket;
      this.options.authToken = result.args[0].body.object.token;
      this.options.acctId = result.args[0].body.object.accountSummary.object.accountId.value;


      cmd = new RTMPCommand(0x11, null, null, null, [new AuthPacket(this.options).generate()]);
      return this.rtmp.send(cmd, function(err, result) {
        if (err) {
          if (_this.options.debug) {
            return console.log('RTMP Auth failed');
          }
        } else {
          return _this.subscribeGN(result);
        }
      });
    };

//Subscribes to GN, CN, BC
  LolClient.prototype.subscribeGN = function(result) {
      var GNPacket, cmd,
        _this = this;
      if (this.options.debug) {
        console.log('Performing GN Subscription');
      }
      GNPacket = lolPackets.GNPacket;

      
      cmd = new RTMPCommand(0x11, null, null, null, [new GNPacket(this.options).generate(this.options.acctId)]);
      return this.rtmp.send(cmd, function(err, result) {
        if (err) {
          if (_this.options.debug) {
            console.log('GN Subscription Failed');
          }
          return _this.stream.destroy();
        } else {
         return _this.subscribeCN(result);
          
        }
      });
    };

   LolClient.prototype.subscribeCN = function(result) {
    var CNPacket, cmd,
      _this = this;
    if (this.options.debug) {
      console.log('Performing CN Subscription');
    }
    CNPacket = lolPackets.CNPacket;
    
      
    
    cmd = new RTMPCommand(0x11, null, null, null, [new CNPacket(this.options).generate(_this.options.acctId)]);
    return this.rtmp.send(cmd, function(err, result) {
      if (err) {
        if (_this.options.debug) {
          console.log('CN Subscription Failed');
        }
        return _this.stream.destroy();
      } else {
        
        return _this.subscribeBC(result);
      }
    });
  };


    LolClient.prototype.subscribeBC = function(result) {
      var BCPacket, cmd,
        _this = this;
      if (this.options.debug) {
        console.log('Performing BC Subscription');
      }
      BCPacket = lolPackets.BCPacket;
      
      cmd = new RTMPCommand(0x11, null, null, null, [new BCPacket(this.options).generate(_this.options.acctId)]);
      return this.rtmp.send(cmd, function(err, result) {
        if (err) {
          if (_this.options.debug) {
            return console.log('BC Subscription failed');
          }
        } else {
          

           if (_this.options.debug) {
            
            console.log('Connect Process Completed');
          }
          return _this.emit('connection');

        }
      });
    };


    LolClient.prototype.getSummonerByName = function(name, cb) {
      var LookupPacket, cmd,
        _this = this;
      if (this.options.debug) {

        console.log("Finding player by name: " + name);
      }
      LookupPacket = lolPackets.LookupPacket;
      cmd = new RTMPCommand(0x11, null, null, null, [new LookupPacket(this.options).generate(name)]);
      return this.rtmp.send(cmd, function(err, result) {
        var _ref, _ref1;
        if (err) {
          return cb(err);
        }
        if ((result != null ? (_ref = result.args) != null ? (_ref1 = _ref[0]) != null ? _ref1.body : void 0 : void 0 : void 0) == null) {
          return cb(err, null);
        }
        return cb(err, result.args[0].body);
      });
    };
//Added method for getting current game by summoner name.
   LolClient.prototype.getCurrentGameByName = function(name, cb) {
      var GetCurrentGamePacket, cmd,
        _this = this;
      if (this.options.debug) {
        console.log("Getting Current Game By Name: " + name);
      }
      GetCurrentGamePacket = lolPackets.GetCurrentGamePacket;
      cmd = new RTMPCommand(0x11, null, null, null, [new GetCurrentGamePacket(this.options).generate(name)]);
      return this.rtmp.send(cmd, function(err, result) {
        var _ref, _ref1;
        if (err) {
          return cb(err);
        }
        if ((result != null ? (_ref = result.args) != null ? (_ref1 = _ref[0]) != null ? _ref1.body : void 0 : void 0 : void 0) == null) {
          return cb(err, null);
        }
        return cb(err, result.args[0].body);
      });
    };

    LolClient.prototype.getSummonerStats = function(acctId, cb) {
      var PlayerStatsPacket, cmd,
        _this = this;
      if (this.options.debug) {
        console.log("Fetching Summoner Stats for " + acctId);
      }
      PlayerStatsPacket = lolPackets.PlayerStatsPacket;
      cmd = new RTMPCommand(0x11, null, null, null, [new PlayerStatsPacket(this.options).generate(Number(acctId))]);
      return this.rtmp.send(cmd, function(err, result) {
        var _ref, _ref1;
        if (err) {
          return cb(err);
        }
        if ((result != null ? (_ref = result.args) != null ? (_ref1 = _ref[0]) != null ? _ref1.body : void 0 : void 0 : void 0) == null) {
          return cb(err, null);
        }
        return cb(err, result.args[0].body);
      });
    };

    LolClient.prototype.getMatchHistory = function(acctId, cb) {
      var RecentGames, cmd,
        _this = this;
      if (this.options.debug) {
        console.log("Fetching recent games for " + acctId);
      }
      RecentGames = lolPackets.RecentGames;
      cmd = new RTMPCommand(0x11, null, null, null, [new RecentGames(this.options).generate(Number(acctId))]);
      return this.rtmp.send(cmd, function(err, result) {
        var _ref, _ref1;
        if (err) {
          return cb(err);
        }
        if ((result != null ? (_ref = result.args) != null ? (_ref1 = _ref[0]) != null ? _ref1.body : void 0 : void 0 : void 0) == null) {
          return cb(err, null);
        }
        return cb(err, result.args[0].body);
      });
    };

    LolClient.prototype.getAggregatedStats = function(acctId, cb) {
      var AggregatedStatsPacket, cmd,
        _this = this;
      AggregatedStatsPacket = lolPackets.AggregatedStatsPacket;
      cmd = new RTMPCommand(0x11, null, null, null, [new AggregatedStatsPacket(this.options).generate(Number(acctId))]);
      return this.rtmp.send(cmd, function(err, result) {
        var _ref, _ref1;
        if (err) {
          return cb(err);
        }
        if ((result != null ? (_ref = result.args) != null ? (_ref1 = _ref[0]) != null ? _ref1.body : void 0 : void 0 : void 0) == null) {
          return cb(err, null);
        }
        return cb(err, result.args[0].body);
      });
    };

    LolClient.prototype.getTeamsForSummoner = function(summonerId, cb) {
      var GetTeamForSummoner, cmd,
        _this = this;
      GetTeamForSummoner = lolPackets.GetTeamForSummoner;
      cmd = new RTMPCommand(0x11, null, null, null, [new GetTeamForSummoner(this.options).generate(Number(summonerId))]);
      return this.rtmp.send(cmd, function(err, result) {
        var _ref, _ref1;
        if (err) {
          cb(err);
        }
        if ((result != null ? (_ref = result.args) != null ? (_ref1 = _ref[0]) != null ? _ref1.body : void 0 : void 0 : void 0) == null) {
          cb(err, null);
        }
        return cb(err, result.args[0].body);
      });
    };

    LolClient.prototype.getTeamById = function(teamId, cb) {
      var GetTeamById, cmd,
        _this = this;
      GetTeamById = lolPackets.GetTeamById;
      cmd = new RTMPCommand(0x11, null, null, null, [new GetTeamById(this.options).generate(teamId)]);
      return this.rtmp.send(cmd, function(err, result) {
        var _ref, _ref1;
        if (err) {
          return cb(err);
        }
        if (!(result != null ? (_ref = result.args) != null ? (_ref1 = _ref[0]) != null ? _ref1.body : void 0 : void 0 : void 0)) {
          return cb(err, null);
        }
        return cb(err, result.args[0].body);
      });
    };

    LolClient.prototype.getSummonerData = function(acctId, cb) {
      var GetSummonerDataPacket, cmd,
        _this = this;
      GetSummonerDataPacket = lolPackets.GetSummonerDataPacket;
      cmd = new RTMPCommand(0x11, null, null, null, [new GetSummonerDataPacket(this.options).generate(acctId)]);
      return this.rtmp.send(cmd, function(err, result) {
        var _ref, _ref1;
        if (err) {
          return cb(err);
        }
        if (!(result != null ? (_ref = result.args) != null ? (_ref1 = _ref[0]) != null ? _ref1.body : void 0 : void 0 : void 0)) {
          return cb(err, null);
        }
        return cb(err, result.args[0].body);
      });
    };

    LolClient.prototype.doCreateGame = function(name, cb) {
      var CreateGamePacket, cmd,
        _this = this;
      CreateGamePacket = lolPackets.CreateGamePacket;
      cmd = new RTMPCommand(0x11, null, null, null, [new CreateGamePacket(this.options).generate(name)]);
      return this.rtmp.send(cmd, function(err, result) 
      {
        var _ref, _ref1;
        if (err) 
        {
          return cb(err);
        }
        if (!(result != null ? (_ref = result.args) != null ? (_ref1 = _ref[0]) != null ? _ref1.body : void 0 : void 0 : void 0)) 
        {
          return cb(err, null);
        }
        return cb(err, result.args[0].body);
      });
    };

     LolClient.prototype.doInvite = function(sum_id, cb) {
      var InvitePacket, cmd,
        _this = this;
      InvitePacket = lolPackets.InvitePacket;
      cmd = new RTMPCommand(0x11, null, null, null, [new InvitePacket(this.options).generate(sum_id)]);
      return this.rtmp.send(cmd, function(err, result) {
        var _ref, _ref1;
        if (err) {
          return cb(err);
        }
        if (!(result != null ? (_ref = result.args) != null ? (_ref1 = _ref[0]) != null ? _ref1.body : void 0 : void 0 : void 0)) {
          return cb(err, null);
        }
        return cb(err, result.args[0].body);
      });
    };

    LolClient.prototype.doTransferOwnership = function(sum_id, cb) {
      var TransferOwnershipPacket, cmd,
        _this = this;
      TransferOwnershipPacket = lolPackets.TransferOwnershipPacket;
      cmd = new RTMPCommand(0x11, null, null, null, [new TransferOwnershipPacket(this.options).generate(sum_id)]);
      return this.rtmp.send(cmd, function(err, result) {
        var _ref, _ref1;
        if (err) {
          return cb(err);
        }
        if (!(result != null ? (_ref = result.args) != null ? (_ref1 = _ref[0]) != null ? _ref1.body : void 0 : void 0 : void 0)) {
          return cb(err, null);
        }
        return cb(err, result.args[0].body);
      });
    };

    LolClient.prototype.doLeave = function(sum_id, cb) {
      var LeavePacket, cmd,
        _this = this;
      LeavePacket = lolPackets.LeavePacket;
      cmd = new RTMPCommand(0x11, null, null, null, [new LeavePacket(this.options).generate(sum_id)]);
      return this.rtmp.send(cmd, function(err, result) {
        var _ref, _ref1;
        if (err) {
          return cb(err);
        }
        if (!(result != null ? (_ref = result.args) != null ? (_ref1 = _ref[0]) != null ? _ref1.body : void 0 : void 0 : void 0)) {
          return cb(err, null);
        }
        return cb(err, result.args[0].body);
      });
    };

     LolClient.prototype.checkPendingInvitations = function(sum_id, cb) {
      var PendingInvitationsPacket, cmd,
        _this = this;
      PendingInvitationsPacket = lolPackets.PendingInvitationsPacket;
      cmd = new RTMPCommand(0x11, null, null, null, [new PendingInvitationsPacket(this.options).generate(sum_id)]);
      return this.rtmp.send(cmd, function(err, result) {
        var _ref, _ref1;
        if (err) {
          return cb(err);
        }
        if (!(result != null ? (_ref = result.args) != null ? (_ref1 = _ref[0]) != null ? _ref1.body : void 0 : void 0 : void 0)) {
          return cb(err, null);
        }
        return cb(err, result.args[0].body);
      });
    };

    LolClient.prototype.PlayerToObserver = function(game_id, cb) {
      var PlayerToObserverPacket, cmd,
        _this = this;
      PlayerToObserverPacket = lolPackets.PlayerToObserverPacket;
      cmd = new RTMPCommand(0x11, null, null, null, [new PlayerToObserverPacket(this.options).generate(game_id)]);
      return this.rtmp.send(cmd, function(err, result) {
        var _ref, _ref1;
        if (err) {
          return cb(err);
        }
        if (!(result != null ? (_ref = result.args) != null ? (_ref1 = _ref[0]) != null ? _ref1.body : void 0 : void 0 : void 0)) {
          return cb(err, null);
        }
        return cb(err, result.args[0].body);
      });
    };

     LolClient.prototype.GetLatestGameTimerState = function(game_id, cb) {
      var GetLatestGameTimerStatePacket, cmd,
        _this = this;
      GetLatestGameTimerStatePacket = lolPackets.GetLatestGameTimerStatePacket;
      cmd = new RTMPCommand(0x11, null, null, null, [new GetLatestGameTimerStatePacket(this.options).generate(game_id)]);
      return this.rtmp.send(cmd, function(err, result) {
        var _ref, _ref1;
        if (err) {
          return cb(err);
        }
        if (!(result != null ? (_ref = result.args) != null ? (_ref1 = _ref[0]) != null ? _ref1.body : void 0 : void 0 : void 0)) {
          return cb(err, null);
        }
        return cb(err, result.args[0].body);
      });
    };

    LolClient.prototype.AcceptInvite = function(invitation_id, cb) {
      var AcceptInvitePacket, cmd,
        _this = this;
      AcceptInvitePacket = lolPackets.AcceptInvitePacket;
      cmd = new RTMPCommand(0x11, null, null, null, [new AcceptInvitePacket(this.options).generate(invitation_id)]);
      return this.rtmp.send(cmd, function(err, result) {
        var _ref, _ref1;
        if (err) {
          return cb(err);
        }
        if (!(result != null ? (_ref = result.args) != null ? (_ref1 = _ref[0]) != null ? _ref1.body : void 0 : void 0 : void 0)) {
          return cb(err, null);
        }
        return cb(err, result.args[0].body);
      });
    };

    return LolClient;

  })(EventEmitter);

  module.exports = LolClient;

/*

Invite Data
{ data: 
   [ { name: 'com.riotgames.platform.gameinvite.contract.InvitationRequest',
       keys: 
        [ 'inviter',
          'inviteType',
          'gameMetaData',
          'owner',
          'invitationStateAsString',
          'invitationState',
          'inviteTypeAsString',
          'invitationId' ],
       object: 
        { inviter: null,
          inviteType: 'DEFAULT',
          gameMetaData: '{"gameId":1632980931,"mapId":1,"gameTypeConfigId":1,"gameMode":"CLASSIC","gameType":"PRACTICE_GAME"}',
          owner: 
           { name: 'com.riotgames.platform.gameinvite.contract.Player',
             keys: [ 'summonerName', 'summonerId' ],
             object: 
              { summonerName: 'Grizzfang',
                summonerId: { value: 25838835 } },
             encoding: 0 },
          invitationStateAsString: 'ACTIVE',
          invitationState: 'ACTIVE',
          inviteTypeAsString: 'DEFAULT',
          invitationId: 'INVID417440047' },
       encoding: 0 } ] }



 */
