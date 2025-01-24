$TTL 3D
$ORIGIN <%= reverse_ip4 %>.
;
@       IN      SOA     ns1.<%= domain %>. master.<%= domain %>. (
                        <%= serial %>   ; serial, today date + today serial
                        1H              ; refresh, seconds
                        2H              ; retry, seconds
                        4W              ; expire, seconds
                        1D )            ; minimum, seconds
;
;
@			IN  NS      ns1.<%= domain %>.
@			IN  NS      ns2.<%= domain %>.

2           IN  PTR     ns1.<%= domain %>.
3           IN  PTR     ns2.<%= domain %>.
3           IN  PTR     smtp.<%= domain %>.
