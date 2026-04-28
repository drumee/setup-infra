server {
    listen 4444 ssl;
    listen [::]:4444 ssl;
    server_name turn.<%= jitsi_public_domain %>;
    ssl_certificate_key <%= certs_dir %>/<%= jitsi_public_domain %>_ecc/<%= jitsi_public_domain %>.key;
    ssl_certificate <%= certs_dir %>/<%= jitsi_public_domain %>_ecc/fullchain.cer;
    ssl_trusted_certificate <%= certs_dir %>/<%= jitsi_public_domain %>_ecc/ca.cer;
}

