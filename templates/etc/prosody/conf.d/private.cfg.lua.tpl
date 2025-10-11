admins = {
    "jigasi@auth.<%= prvate_jitsi %>",
    "jibri@auth.<%= prvate_jitsi %>",
    "focus@auth.<%= prvate_jitsi %>",
    "jvb@auth.<%= prvate_jitsi %>"
}

unlimited_jids = {
    "focus@auth.<%= prvate_jitsi %>",
    "jvb@auth.<%= prvate_jitsi %>"
}

plugin_paths = { "/usr/share/jitsi-meet/prosody-plugins/", "/prosody-plugins-custom" }

muc_mapper_domain_base = "<%= prvate_jitsi %>";
muc_mapper_domain_prefix = "muc";
http_default_host = "<%= prvate_jitsi %>"
consider_bosh_secure = true;
consider_websocket_secure = true;

VirtualHost "<%= prvate_jitsi %>"
    authentication = "internal_hashed"
    ssl = {
        key = "<%= certs_dir %>/<%= prvate_jitsi %>_ecc/<%= prvate_jitsi %>.key";
        certificate = "<%= certs_dir %>/<%= prvate_jitsi %>_ecc/<%= prvate_jitsi %>.cer";
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
    main_muc = "muc.<%= prvate_jitsi %>"
    lobby_muc = "lobby.<%= prvate_jitsi %>"
    breakout_rooms_muc = "breakout.<%= prvate_jitsi %>"
    speakerstats_component = "speakerstats.<%= prvate_jitsi %>"
    conference_duration_component = "conferenceduration.<%= prvate_jitsi %>"
    end_conference_component = "endconference.<%= prvate_jitsi %>"
    av_moderation_component = "avmoderation.<%= prvate_jitsi %>"
    turncredentials_secret = "<%= turn_sercret %>"
    c2s_require_encryption = false


VirtualHost "guest.<%= prvate_jitsi %>"
    authentication = "anonymous"
    ssl = {
        key = "/usr/share/acme/certs/<%= prvate_jitsi %>_ecc/<%= prvate_jitsi %>.key";
        certificate = "/usr/share/acme/certs/<%= prvate_jitsi %>_ecc/<%= prvate_jitsi %>.cer";
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
    main_muc = "muc.<%= prvate_jitsi %>"
    lobby_muc = "lobby.<%= prvate_jitsi %>"
    breakout_rooms_muc = "breakout.<%= prvate_jitsi %>"
    speakerstats_component = "speakerstats.<%= prvate_jitsi %>"
    conference_duration_component = "conferenceduration.<%= prvate_jitsi %>"
    end_conference_component = "endconference.<%= prvate_jitsi %>"
    av_moderation_component = "avmoderation.<%= prvate_jitsi %>"
    turncredentials_secret = "<%= turn_sercret %>"
    c2s_require_encryption = false


VirtualHost "auth.<%= prvate_jitsi %>"
    ssl = {
        key = "<%= certs_dir %>/<%= prvate_jitsi %>_ecc/<%= prvate_jitsi %>.key";
        certificate = "<%= certs_dir %>/<%= prvate_jitsi %>_ecc/fullchain.cer";
    }
    modules_enabled = {
        "limits_exception";
    }
    authentication = "internal_hashed"



Component "internal-muc.<%= prvate_jitsi %>" "muc"
    storage = "memory"
    modules_enabled = {
        "ping";
    }
    restrict_room_creation = true
    muc_room_locking = false
    muc_room_default_public_jids = true

Component "muc.<%= prvate_jitsi %>" "muc"
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

Component "focus.<%= prvate_jitsi %>" "client_proxy"
    target_address = "focus@auth.<%= prvate_jitsi %>"

Component "speakerstats.<%= prvate_jitsi %>" "speakerstats_component"
    muc_component = "muc.<%= prvate_jitsi %>"

Component "conferenceduration.<%= prvate_jitsi %>" "conference_duration_component"
    muc_component = "muc.<%= prvate_jitsi %>"


Component "endconference.<%= prvate_jitsi %>" "end_conference"
    muc_component = "muc.<%= prvate_jitsi %>"


Component "lobby.<%= prvate_jitsi %>" "muc"
    storage = "memory"
    restrict_room_creation = true
    muc_room_locking = false
    muc_room_default_public_jids = true
    modules_enabled = {
    }


Component "breakout.<%= prvate_jitsi %>" "muc"
    storage = "memory"
    restrict_room_creation = true
    muc_room_locking = false
    muc_room_default_public_jids = true
    modules_enabled = {
        "muc_meeting_id";
        "muc_domain_mapper";
        "polls";
    }


Component "metadata.<%= prvate_jitsi %>" "room_metadata_component"
    muc_component = "muc.<%= prvate_jitsi %>"
    breakout_rooms_component = "breakout.<%= prvate_jitsi %>"
