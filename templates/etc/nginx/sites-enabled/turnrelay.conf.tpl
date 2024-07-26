server {
    listen 4444 ssl;
    listen [::]:4444 ssl;
    server_name turn.<%= jitsi_domain %>;
    ssl_certificate_key <%= certs_dir %>/<%= jitsi_domain %>_ecc/<%= jitsi_domain %>.key;
    ssl_certificate <%= certs_dir %>/<%= jitsi_domain %>_ecc/fullchain.cer;
    ssl_trusted_certificate <%= certs_dir %>/<%= jitsi_domain %>_ecc/ca.cer;
}

