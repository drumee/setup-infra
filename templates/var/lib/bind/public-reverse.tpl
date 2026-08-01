$TTL 3D
; named.conf.local declares this zone as <reverse>.in-addr.arpa, so the origin
; has to be the same name — a bare "5.168.192." puts every record below it out
; of zone, and named drops the lot.
$ORIGIN <%= reverse_public_ip4 %>.in-addr.arpa.
;
@       IN      SOA     ns1.<%= public_domain %>. master.<%= public_domain %>. (
                        <%= serial %>   ; serial, today date + today serial
                        1H              ; refresh, seconds
                        2H              ; retry, seconds
                        4W              ; expire, seconds
                        1D )            ; minimum, seconds
;
;
@			IN  NS      ns1.<%= public_domain %>.
@			IN  NS      ns2.<%= public_domain %>.

2           IN  PTR     ns1.<%= public_domain %>.
3           IN  PTR     ns2.<%= public_domain %>.
3           IN  PTR     smtp.<%= public_domain %>.
