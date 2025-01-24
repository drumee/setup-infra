admins = {
    "jigasi@auth.<%= public_jitsi %>",
    "jibri@auth.<%= public_jitsi %>",
    "focus@auth.<%= public_jitsi %>",
    "jvb@auth.<%= public_jitsi %>"
}

unlimited_jids = {
    "focus@auth.<%= public_jitsi %>",
    "jvb@auth.<%= public_jitsi %>"
}

plugin_paths = { "/usr/share/jitsi-meet/prosody-plugins/", "/prosody-plugins-custom" }

muc_mapper_domain_base = "<%= public_jitsi %>";
muc_mapper_domain_prefix = "muc";
http_default_host = "<%= public_jitsi %>"
consider_bosh_secure = true;
consider_websocket_secure = true;

VirtualHost "<%= public_jitsi %>"
    authentication = "internal_hashed"
    ssl = {
        key = "<%= certs_dir %>/<%= public_jitsi %>_ecc/<%= public_jitsi %>.key";
        certificate = "<%= certs_dir %>/<%= public_jitsi %>_ecc/<%= public_jitsi %>.cer";
    }
    modules_enabled = {
        "bosh";
        "websocket";
        "smacks"; -- XEP-0198: Stream Management
        "pubsub";
        "ping";
        "speakerstats";
        "conference_duration";
        "room_metadata";
        "end_conference";
        "muc_lobby_rooms";
        "muc_breakout_rooms";
        "av_moderation";
        "turncredentials";
    }
    main_muc = "muc.<%= public_jitsi %>"
    lobby_muc = "lobby.<%= public_jitsi %>"
    breakout_rooms_muc = "breakout.<%= public_jitsi %>"
    speakerstats_component = "speakerstats.<%= public_jitsi %>"
    conference_duration_component = "conferenceduration.<%= public_jitsi %>"
    end_conference_component = "endconference.<%= public_jitsi %>"
    av_moderation_component = "avmoderation.<%= public_jitsi %>"
    turncredentials_secret = "<%= turn_sercret %>"
    c2s_require_encryption = false


VirtualHost "guest.<%= public_jitsi %>"
    authentication = "anonymous"
    ssl = {
        key = "/usr/share/acme/certs/<%= public_jitsi %>_ecc/<%= public_jitsi %>.key";
        certificate = "/usr/share/acme/certs/<%= public_jitsi %>_ecc/<%= public_jitsi %>.cer";
    }
    modules_enabled = {
        "bosh";
        "websocket";
        "smacks"; -- XEP-0198: Stream Management
        "pubsub";
        "ping";
        "speakerstats";
        "conference_duration";
        "room_metadata";
        "end_conference";
        "muc_lobby_rooms";
        "muc_breakout_rooms";
        "av_moderation";
 	    "turncredentials";
    }
    main_muc = "muc.<%= public_jitsi %>"
    lobby_muc = "lobby.<%= public_jitsi %>"
    breakout_rooms_muc = "breakout.<%= public_jitsi %>"
    speakerstats_component = "speakerstats.<%= public_jitsi %>"
    conference_duration_component = "conferenceduration.<%= public_jitsi %>"
    end_conference_component = "endconference.<%= public_jitsi %>"
    av_moderation_component = "avmoderation.<%= public_jitsi %>"
    turncredentials_secret = "<%= turn_sercret %>"
    c2s_require_encryption = false


VirtualHost "auth.<%= public_jitsi %>"
    ssl = {
        key = "<%= certs_dir %>/<%= public_jitsi %>_ecc/<%= public_jitsi %>.key";
        certificate = "<%= certs_dir %>/<%= public_jitsi %>_ecc/fullchain.cer";
    }
    modules_enabled = {
        "limits_exception";
    }
    authentication = "internal_hashed"



Component "internal-muc.<%= public_jitsi %>" "muc"
    storage = "memory"
    modules_enabled = {
        "ping";
    }
    restrict_room_creation = true
    muc_room_locking = false
    muc_room_default_public_jids = true

Component "muc.<%= public_jitsi %>" "muc"
    restrict_room_creation = true
    storage = "memory"
    modules_enabled = {
        "muc_meeting_id";
        "polls";
        "muc_domain_mapper";
        "muc_password_whitelist";
    }

    -- The size of the cache that saves state for IP addresses
	rate_limit_cache_size = 10000;
    muc_room_cache_size = 1000
    muc_room_locking = false
    muc_room_default_public_jids = true
    muc_password_whitelist = {
        "focus@<no value>"
    }

Component "focus.<%= public_jitsi %>" "client_proxy"
    target_address = "focus@auth.<%= public_jitsi %>"

Component "speakerstats.<%= public_jitsi %>" "speakerstats_component"
    muc_component = "muc.<%= public_jitsi %>"

Component "conferenceduration.<%= public_jitsi %>" "conference_duration_component"
    muc_component = "muc.<%= public_jitsi %>"


Component "endconference.<%= public_jitsi %>" "end_conference"
    muc_component = "muc.<%= public_jitsi %>"


Component "lobby.<%= public_jitsi %>" "muc"
    storage = "memory"
    restrict_room_creation = true
    muc_room_locking = false
    muc_room_default_public_jids = true
    modules_enabled = {
    }


Component "breakout.<%= public_jitsi %>" "muc"
    storage = "memory"
    restrict_room_creation = true
    muc_room_locking = false
    muc_room_default_public_jids = true
    modules_enabled = {
        "muc_meeting_id";
        "muc_domain_mapper";
        "polls";
    }


Component "metadata.<%= public_jitsi %>" "room_metadata_component"
    muc_component = "muc.<%= public_jitsi %>"
    breakout_rooms_component = "breakout.<%= public_jitsi %>"
