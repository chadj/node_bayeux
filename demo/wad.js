require("./bayeux.js");

var members = {};
var wad_handler = function(bayeux_resp,channel,msg) {
    bayeuxBroadcast(bayeux_resp,channel,msg);

    if(!members[channel]) members[channel] = {};

    var members_map = members[channel];
    var data = msg.data;

    if("join" == data.type) {
        var client = data.client;
        members_map[msg.clientId] = {id: msg.clientId, x: client.x, y: client.y};

        clients[msg.clientId].deliver({data: {type: "list", clients: members_map} }, channel, msg.id);
        clients[msg.clientId].remove = function() {
            var m = members_map[msg.clientId];
            delete members_map[msg.clientId];
            delete clients[msg.clientId];

            broadcast(channel, {data: {type: "leave", client: m}}, msg.id);
        };
    }
    else if("loc" == data.type) {
        var client = data.client;
        var m = members_map[msg.clientId];
        if(m) {
            m.x = client.x;
            m.y = client.y;
        }
    }
};

var static_mapping = [
    ["/", "public/index.html"],
    ["/index.html", "public/index.html"],
    ["/wad.js", "public/wad.js"],
    ["/wad.css", "public/wad.css"],
    ["/org/cometd.js", "public/org/cometd.js"],
    ["/jquery/jquery-1.3.2.js", "public/jquery/jquery-1.3.2.js"],
    ["/jquery/jquery.json-1.3.js", "public/jquery/jquery.json-1.3.js"],
    ["/jquery/jquery.cometd.js", "public/jquery/jquery.cometd.js"],
    ["/raphael/raphael-min.js", "public/raphael/raphael-min.js"]
];

var srv = new service(8001, null, static_mapping);

srv.subscribe("/wad/demo", wad_handler);
srv.createServer();