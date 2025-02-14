jicofo {
    // Configuration related to jitsi-videobridge
    bridge {
      brewery-jid = "jvbbrewery@internal-muc.<%= jitsi_public_domain %>" 
    }
    // Configure the codecs and RTP extensions to be used in the offer sent to clients.
    codec {
      video {
      }
      audio {
      }
    }

    conference {
    }
    octo {
      // Whether or not to use Octo. Note that when enabled, its use will be determined by
      // $jicofo.bridge.selection-strategy. There's a corresponding flag in the JVB and these
      // two MUST be in sync (otherwise bridges will crash because they won't know how to
      // deal with octo channels).
      enabled = false
    }
    sctp {
      enabled = false
    }
    authentication: {
       enabled: true
       type: JWT
       login-url: <%= jitsi_public_domain %>
    }
    xmpp {
      client {
        enabled = true
        hostname = "xmpp.<%= jitsi_public_domain %>"
        port = "5222"
        domain = "auth.<%= jitsi_public_domain %>"
        xmpp-domain = "<%= jitsi_public_domain %>"
        username = "focus"
        password = "<%= jicofo_password %>"
        conference-muc-jid = "muc.<%= jitsi_public_domain %>"
        client-proxy = "focus.<%= jitsi_public_domain %>"
        disable-certificate-verification = true
      }
    }
}

