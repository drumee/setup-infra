$TTL 3D
$ORIGIN <%= private_reverse_ip4 %>.
;
@       IN      SOA     ns1.<%= private_domain %>. master.<%= private_domain %>. (
                        <%= serial %>   ; serial, today date + today serial
                        1H              ; refresh, seconds
                        2H              ; retry, seconds
                        4W              ; expire, seconds
                        1D )            ; minimum, seconds
;
;
@			IN  NS      ns1.<%= private_domain %>.
@			IN  NS      ns2.<%= private_domain %>.

2           IN  PTR     ns1.<%= private_domain %>.
3           IN  PTR     ns2.<%= private_domain %>.
3           IN  PTR     smtp.<%= private_domain %>.
