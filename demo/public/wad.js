var wad = function(){
    var _username;
    var _lastUser;
    var _cometURL = "/cometd";
    var _blit_r = 15;
    var _net = 150;
    var _anim = 120;
    var _chatSubscription;
    var _metaSubscriptions = [];
    var _handshook = false;
    var _connected = false;
    var _cometd;
    var _paper;

    var _selected;
    var _me;
    var _things = {};

    return {
        things: _things,
        init: function(){
            //  _comet = new $.Cometd(); // Creates a new Comet object
            document.cookie = "BAYEUX_BROWSER=; path=/";
            _cometd = $.cometd;

            var container_width = $('#container').width();
            var container_height = $('#container').height();
            var blit_r = 15;

            _paper = Raphael("container", container_width, container_height);

            var start_x = Math.floor(Math.random() * (container_width - (blit_r * 2) + 1)) + _blit_r;
            var start_y = Math.floor(Math.random() * (container_height - (blit_r * 2) + 1)) + _blit_r;
            _me = _paper.circle(start_x, start_y, _blit_r);
            _me.attr("fill", "#4C6C6E");
            _me.attr("stroke", "#4C6C6E");
            _me.node.id = "me";

            _me.node.onmousedown = function(e){
                _selected = {
                    node: _me,
                    x: e.pageX - _me.node.getAttribute("cx"),
                    y: e.pageY - _me.node.getAttribute("cy")
                };
                e.preventDefault();
            };
            _me.node.onmouseup = function(e){
                _selected = undefined;
                e.preventDefault();
            };

            $().mousemove(function(e){
                if (_selected) {
                    var x = e.pageX - _selected.x;
                    var y = e.pageY - _selected.y;

                    _selected.node.attr({
                        cx: x,
                        cy: y
                    });
                }
                e.preventDefault();
            });

            var last_x = start_x;
            var last_y = start_y;
            var update_loc = function(){
                var x = _me.node.getAttribute("cx");
                var y = _me.node.getAttribute("cy");

                if (x != last_x || y != last_y) {
                    _cometd.startBatch();
                    _cometd.publish('/wad/demo', {
                        type: "loc",
                        client: {
                            id: _cometd.getClientId(),
                            x: x,
                            y: y
                        }

                    });
                    _cometd.endBatch();
                }

                last_x = x;
                last_y = y;
                setTimeout(update_loc, _net);
            };
            update_loc();

            join();

            $(window).unload(leave);
        }
    };

    function _chatUnsubscribe(){
        if (_chatSubscription)
            _cometd.unsubscribe(_chatSubscription);
        _chatSubscription = null;
    }

    function _chatSubscribe(){
        _chatUnsubscribe();
        _chatSubscription = _cometd.subscribe('/wad/demo', this, receive);
    }

    function _metaUnsubscribe(){
        $.each(_metaSubscriptions, function(index, subscription){
            _cometd.removeListener(subscription);
        });
        _metaSubscriptions = [];
    }

    function _metaSubscribe(){
        _metaUnsubscribe();
        _metaSubscriptions.push(_cometd.addListener('/meta/handshake', this, _metaHandshake));
        _metaSubscriptions.push(_cometd.addListener('/meta/connect', this, _metaConnect));
    }

    function _metaHandshake(message){
        _handshook = message.successful;
        _connected = false;
    }

    function _metaConnect(message){
        var wasConnected = _connected;
        _connected = message.successful;
        if (wasConnected) {
            if (_connected) {
                // Normal operation, a long poll that reconnects
            }
            else {
                // Disconnected
                /*receive({
                 data: {
                 user: 'CHAT',
                 join: true,
                 chat: 'Disconnected'
                 }
                 });*/
            }
        }
        else {
            if (_connected) {
                /*receive({
                 data: {
                 user: 'CHAT',
                 join: true,
                 chat: 'Connected'
                 }
                 });*/
                _cometd.startBatch();
                _chatSubscribe();
                _cometd.publish('/wad/demo', {
                    type: "join",
                    client: {
                        id: _cometd.getClientId(),
                        x: _me.node.getAttribute("cx"),
                        y: _me.node.getAttribute("cy")
                    }

                });
                _cometd.endBatch();
            }
            else {
                // Could not connect
                /*receive({
                 data: {
                 user: 'CHAT',
                 join: true,
                 chat: 'Could not connect'
                 }
                 });*/
            }
        }
    }

    function join(){
        _metaSubscribe();
        _cometd.init(_cometURL);
    }

    function leave(){
        _cometd.startBatch();
        _chatUnsubscribe();
        _cometd.endBatch();

        _metaUnsubscribe();

        _cometd.disconnect();
    }

    function send(){
        var phrase = $('#phrase');
        var text = phrase.val();
        phrase.val('');

        if (!text || !text.length)
            return;

        var colons = text.indexOf('::');
        if (colons > 0) {
            _cometd.publish('/service/privatechat', {
                room: '/wad/demo', // This should be replaced by the room name
                user: _username,
                chat: text.substring(colons + 2),
                peer: text.substring(0, colons)
            });
        }
        else {
            _cometd.publish('/wad/demo', {
                user: _username,
                chat: text
            });
        }
    }

    function receive(message){
        if (message.data.type == "list") {
            $.each(message.data.clients, function(index, client){
                if (_cometd.getClientId() != index) {
                    _things[index] = {};
                    _things[index].client = client;

                    var it = _paper.circle(client.x, client.y, _blit_r);
                    it.attr("fill", "#000");
                    it.attr("stroke", "#000");
                    it.node.id = index;
                    _things[index].it = it;
                }
            });
        }
        else
            if (message.data.type == "join") {
                var client = message.data.client;

                if (_cometd.getClientId() != client.id) {
                    _things[client.id] = {};
                    _things[client.id].client = client;

                    var it = _paper.circle(client.x, client.y, _blit_r);
                    it.attr("fill", "#000");
                    it.attr("stroke", "#000");
                    it.node.id = client.id;
                    _things[client.id].it = it;
                }
            }
        else if (message.data.type == "leave") {
            var client = message.data.client;
            var it = _things[client.id].it;
            delete _things[client.id];

            it.remove();
        }
        else if (message.data.type == "loc") {
            var client = message.data.client;

            var thingy = _things[client.id];
            if (_cometd.getClientId() != client.id && thingy) {
                var it = thingy.it;
                it.animate({cx: client.x, cy: client.y}, _anim);

                thingy.client = client;
            }
        }
    }
}();
