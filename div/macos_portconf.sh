echo "
rdr pass inet proto tcp from any to any port 80 -> 127.0.0.1 port 4000
" | sudo pfctl -ef -