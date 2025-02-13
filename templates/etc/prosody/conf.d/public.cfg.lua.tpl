admins = {
    "jigasi@auth.<%= jitsi_public_domain %>",
    "jibri@auth.<%= jitsi_public_domain %>",
    "focus@auth.<%= jitsi_public_domain %>",
    "jvb@auth.<%= jitsi_public_domain %>"
}

unlimited_jids = {
    "focus@auth.<%= jitsi_public_domain %>",
    "jvb@auth.<%= jitsi_public_domain %>"
}

plugin_paths = { "/usr/share/jitsi-meet/prosody-plugins/", "/prosody-plugins-custom" }

muc_mapper_domain_base = "<%= jitsi_public_domain %>";
muc_mapper_domain_prefix = "muc";
http_default_host = "<%= jitsi_public_domain %>"
consider_bosh_secure = true;
consider_websocket_secure = true;

VirtualHost "<%= jitsi_public_domain %>"
    authentication = "internal_hashed"
    ssl = {
        key = "<%= certs_dir %>/<%= jitsi_public_domain %>_ecc/<%= jitsi_public_domain %>.key";
        certificate = "<%= certs_dir %>/<%= jitsi_public_domain %>_ecc/<%= jitsi_public_domain %>.cer";
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
    main_muc = "muc.<%= jitsi_public_domain %>"
    lobby_muc = "lobby.<%= jitsi_public_domain %>"
    breakout_rooms_muc = "breakout.<%= jitsi_public_domain %>"
    speakerstats_component = "speakerstats.<%= jitsi_public_domain %>"
    conference_duration_component = "conferenceduration.<%= jitsi_public_domain %>"
    end_conference_component = "endconference.<%= jitsi_public_domain %>"
    av_moderation_component = "avmoderation.<%= jitsi_public_domain %>"
    turncredentials_secret = "<%= turn_sercret %>"
    c2s_require_encryption = false


VirtualHost "guest.<%= jitsi_public_domain %>"
    authentication = "anonymous"
    ssl = {
        key = "/usr/share/acme/certs/<%= jitsi_public_domain %>_ecc/<%= jitsi_public_domain %>.key";
        certificate = "/usr/share/acme/certs/<%= jitsi_public_domain %>_ecc/<%= jitsi_public_domain %>.cer";
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
    main_muc = "muc.<%= jitsi_public_domain %>"
    lobby_muc = "lobby.<%= jitsi_public_domain %>"
    breakout_rooms_muc = "breakout.<%= jitsi_public_domain %>"
    speakerstats_component = "speakerstats.<%= jitsi_public_domain %>"
    conference_duration_component = "conferenceduration.<%= jitsi_public_domain %>"
    end_conference_component = "endconference.<%= jitsi_public_domain %>"
    av_moderation_component = "avmoderation.<%= jitsi_public_domain %>"
    turncredentials_secret = "<%= turn_sercret %>"
    c2s_require_encryption = false


VirtualHost "auth.<%= jitsi_public_domain %>"
    ssl = {
        key = "<%= certs_dir %>/<%= jitsi_public_domain %>_ecc/<%= jitsi_public_domain %>.key";
        certificate = "<%= certs_dir %>/<%= jitsi_public_domain %>_ecc/fullchain.cer";
    }
    modules_enabled = {
        "limits_exception";
    }
    authentication = "internal_hashed"



Component "internal-muc.<%= jitsi_public_domain %>" "muc"
    storage = "memory"
    modules_enabled = {
        "ping";
    }
    restrict_room_creation = true
    muc_room_locking = false
    muc_room_default_public_jids = true

Component "muc.<%= jitsi_public_domain %>" "muc"
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

Component "focus.<%= jitsi_public_domain %>" "client_proxy"
    target_address = "focus@auth.<%= jitsi_public_domain %>"

Component "speakerstats.<%= jitsi_public_domain %>" "speakerstats_component"
    muc_component = "muc.<%= jitsi_public_domain %>"

Component "conferenceduration.<%= jitsi_public_domain %>" "conference_duration_component"
    muc_component = "muc.<%= jitsi_public_domain %>"


Component "endconference.<%= jitsi_public_domain %>" "end_conference"
    muc_component = "muc.<%= jitsi_public_domain %>"


Component "lobby.<%= jitsi_public_domain %>" "muc"
    storage = "memory"
    restrict_room_creation = true
    muc_room_locking = false
    muc_room_default_public_jids = true
    modules_enabled = {
    }


Component "breakout.<%= jitsi_public_domain %>" "muc"
    storage = "memory"
    restrict_room_creation = true
    muc_room_locking = false
    muc_room_default_public_jids = true
    modules_enabled = {
        "muc_meeting_id";
        "muc_domain_mapper";
        "polls";
    }


Component "metadata.<%= jitsi_public_domain %>" "room_metadata_component"
    muc_component = "muc.<%= jitsi_public_domain %>"
    breakout_rooms_component = "breakout.<%= jitsi_public_domain %>"
