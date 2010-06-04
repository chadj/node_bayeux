var fu = require("./fu");
var hash = require("./md5");
var sys = require("sys");

var bayeux = exports;

var client = function(messager) {
    this.ping = new Date();
    this.client_id = hash.md5(this.ping.getTime()+""+Math.random());
    var messages = [];

    this.deliver = function(msg, channel, id) {
        messages.push({msg: msg, channel:channel, id:id});
        var client_id = this.client_id;

        setTimeout(function() {messager.emit(client_id);}, 1);
    };

    this.receive = function(wait, bayeux_resp, id) {
        if(messages.length > 0) {
            var envelope = messages.shift();
            var msg = envelope.msg;
            msg["id"] = envelope.id;
            msg["channel"] = envelope.channel;

            bayeux_resp.msgs.push(msg);
            bayeux_resp.msgs.push({"id":id,"successful":true,"channel":"/meta/connect"});
        }
        else if(wait) {
            bayeux_resp.long_poll = true;
            var client_id = this.client_id;
            var listener = function() {
                if(messages.length > 0) {
                    clearTimeout(timeout);
                    messager.removeListener(client_id, listener);
                    var envelope = messages.shift();
                    var msg = envelope.msg;

                    msg["id"] = envelope.id;
                    msg["channel"] = envelope.channel;

                    bayeux_resp.msgs.push(msg);
                    bayeux_resp.msgs.push({"id":id,"successful":true,"channel":"/meta/connect"});

                    bayeux_resp.http_res.simpleJSON(200, bayeux_resp.msgs);
                }
            };
            messager.addListener(client_id, listener);
            var timeout = setTimeout(function() {
                                         messager.removeListener(client_id, listener);
                                         bayeux_resp.http_res.simpleJSON(200, [{id: id, successful: true, channel: "/meta/connect"}]);
                                     },30000);
        }
    };
};
bayeux.client = client;

var service = function() {
    var handlers = {};
    var message_ct = 0;
    var clients = {};
    var channels = {};
    var messager = new process.EventEmitter();

    var regex_specials = new RegExp("[.*+?|()\\[\\]{}\\\\\\/]", "g"); // .*+?|()[]{}\/

    setInterval(function() {
                    for(var i in clients) {
                        if(!clients.hasOwnProperty(i)) continue;

                        var cutoff = (new Date()).getTime() - 30000;
                        if(clients[i].ping.getTime() < cutoff && clients[i].remove) {
                            clients[i].remove();
                        }
                    }
                },5000);

    var bayeuxRouter = function(req, res) {
        var body = "";
        req.addListener("body", function(chunk) {
                            body += chunk;
                        });
        req.addListener("complete", function() {
                            var req_msgs = JSON.parse(body);
                            var resp = {http_res: res, msgs: [], long_poll: false};

                            for(var i=0; i < req_msgs.length; i++) {
                                var msg = req_msgs[i];
                                var channel = msg.channel;

                                message_ct++;
                                var handled = false;
                                for(var t in handlers) {
                                    if(!handlers.hasOwnProperty(t)) continue;
                                    var h = handlers[t];
                                    if(h.pattern.test(channel)) {
                                        handled = true;
                                        h.handler(resp,channel,msg);
                                        break;
                                    }
                                }
                                if(!handled) bayeuxBroadcast(resp,channel,msg);
                            }

                            if(!resp.long_poll) res.simpleJSON(200, resp.msgs);
                        });
    };

    var bayeuxHandshake = function(bayeux_resp,channel,msg) {
        var c = new client(messager);
        clients[c.client_id] = c;

        c.deliver({"advice":{"reconnect":"retry","interval":0,"timeout":30000}}, "/meta/connect", msg.id);

        bayeux_resp.msgs.push({"id":msg.id,"minimumVersion":"0.9","supportedConnectionTypes":["long-polling","callback-polling"],"successful":true,"channel":"/meta/handshake","advice":{"reconnect":"retry","interval":0,"timeout":30000},"clientId":c.client_id,"version":"1.0"});
    };

    var bayeuxConnect = function(bayeux_resp,channel,msg) {
        var client_id = msg.clientId;

        var client = clients[client_id];

        if(client) {
            client.ping = new Date();
            client.receive(true, bayeux_resp,msg.id);
        }
        else {
            bayeux_resp.msgs.push({"id":msg.id,"successful":false,"channel":"/meta/connect"});
        }
    };

    var broadcast = function(channel, msg, id) {
        for(var i=0; i < channels[channel].length; i++) {
            channels[channel][i].deliver(msg, channel, id);
        }
    };

    var bayeuxBroadcast = function(bayeux_resp,channel,msg) {
        if(!channels[channel]) channels[channel] = [];
        var client_id = msg.clientId;
        var client = clients[client_id];

        broadcast(channel, {data: msg.data}, msg.id);

        bayeux_resp.msgs.push({"id":msg.id,"successful":true,"channel":channel});
        
        if(client) {
            client.ping = new Date();
            client.receive(false, bayeux_resp,msg.id);
        }
    };

    var bayeuxSubscribe = function(bayeux_resp,channel,msg) {
        var client_id = msg.clientId;

        var client = clients[client_id];
        if(client) {
            var subscription = msg.subscription;
            if(!channels[subscription]) channels[subscription] = [];

            channels[subscription].push(client);

            bayeux_resp.msgs.push({"id":msg.id,"successful":true,"subscription":subscription,"channel":"/meta/subscribe"});
        }
        else {
            bayeux_resp.msgs.push({"id":msg.id,"successful":false,"channel":"/meta/subscribe"});
        }
    };

    registerHandler = function(pattern, handler) {
        pattern = pattern.replace(regex_specials, "\\$&");

        handlers[pattern] = {handler:handler, pattern: new RegExp("^"+pattern+"$")};
    };

    this.subscribe = function(pattern, handler) {
        registerHandler(pattern, handler);
    };

    this.createServer = function(port, host, static_resources) {
        fu.listen(port, host);

        if(static_resources != null) {
            for(var i=0; i<static_resources.length; i++) {
                fu.get(static_resources[i][0], fu.staticHandler(static_resources[i][1]));
            }
        }

        fu.get("/cometd", bayeuxRouter);
    };

    registerHandler("/meta/handshake", bayeuxHandshake);
    registerHandler("/meta/connect", bayeuxConnect);
    registerHandler("/meta/subscribe", bayeuxSubscribe);
    registerHandler("/wad/demo", wad);
};
bayuex.service = service;
